// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SECToken.sol";
import "./ActualCreditToken.sol";

/// @title CreditPool -- accepts ProjectTokens, mints weighted SEC, distributes ACC after maturity
contract CreditPool is Ownable {
    using SafeERC20 for IERC20;

    SECToken public secToken;
    ActualCreditToken public accToken;

    struct PooledProject {
        uint256 weight;       // weight multiplier (18 decimals, 1e18 = 1x)
        uint256 totalDeposited;
        bool registered;
    }

    mapping(address => PooledProject) public pooledProjects;
    address[] public registeredTokens;

    uint256 public accAllocatedToPool;

    event Deposited(address indexed user, address indexed token, uint256 amount, uint256 secMinted);
    event Withdrawn(address indexed user, uint256 secBurned);
    event AccClaimed(address indexed user, uint256 accAmount);
    event ProjectRegistered(address indexed token, uint256 weight);
    event AccAllocated(uint256 amount);

    constructor(address _secToken, address _accToken) Ownable(msg.sender) {
        secToken = SECToken(_secToken);
        accToken = ActualCreditToken(_accToken);
    }

    function registerProject(address _token, uint256 _weight) external onlyOwner {
        require(!pooledProjects[_token].registered, "Already registered");
        require(_weight > 0, "Weight must be > 0");
        pooledProjects[_token] = PooledProject(_weight, 0, true);
        registeredTokens.push(_token);
        emit ProjectRegistered(_token, _weight);
    }

    /// @notice Deposit project tokens into the pool; receive weighted SEC tokens
    function deposit(address _token, uint256 _amount) external {
        PooledProject storage pp = pooledProjects[_token];
        require(pp.registered, "Token not registered");
        require(_amount > 0, "Amount must be > 0");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        pp.totalDeposited += _amount;

        uint256 secToMint = (_amount * pp.weight) / 1e18;
        secToken.mint(msg.sender, secToMint);

        emit Deposited(msg.sender, _token, _amount, secToMint);
    }

    /// @notice Burn SEC to withdraw proportional project tokens from the pool
    function withdraw(uint256 _secAmount) external {
        require(_secAmount > 0, "Amount must be > 0");
        uint256 totalSec = secToken.totalSupply();
        require(totalSec > 0, "No SEC in circulation");

        secToken.burn(msg.sender, _secAmount);

        for (uint256 i = 0; i < registeredTokens.length; i++) {
            address token = registeredTokens[i];
            uint256 poolBalance = IERC20(token).balanceOf(address(this));
            uint256 share = (poolBalance * _secAmount) / totalSec;
            if (share > 0) {
                IERC20(token).safeTransfer(msg.sender, share);
                pooledProjects[token].totalDeposited -= share;
            }
        }

        emit Withdrawn(msg.sender, _secAmount);
    }

    /// @notice Called by CreditManager after maturity to allocate ACC to the pool
    function allocateAcc(uint256 _amount) external onlyOwner {
        accAllocatedToPool += _amount;
        emit AccAllocated(_amount);
    }

    /// @notice SEC holders claim their proportional ACC after maturity airdrops
    function claimActualCredits(uint256 _secAmount) external {
        require(accAllocatedToPool > 0, "No ACC allocated yet");
        uint256 totalSec = secToken.totalSupply();
        require(totalSec > 0, "No SEC in circulation");

        uint256 accShare = (accAllocatedToPool * _secAmount) / totalSec;
        require(accShare > 0, "Nothing to claim");

        secToken.burn(msg.sender, _secAmount);
        accAllocatedToPool -= accShare;
        accToken.transfer(msg.sender, accShare);

        emit AccClaimed(msg.sender, accShare);
    }

    function registeredTokenCount() external view returns (uint256) {
        return registeredTokens.length;
    }
}
