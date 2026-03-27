// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SECToken.sol";
import "./ActualCreditToken.sol";

/// @title CreditPool - Accepts ProjectTokens, mints 1:1 CIT, distributes VCC via FCFS
contract CreditPool is Ownable {
    using SafeERC20 for IERC20;

    SECToken public citToken;
    ActualCreditToken public vccToken;

    struct PooledProject {
        uint256 totalDeposited;
        bool registered;
    }

    mapping(address => PooledProject) public pooledProjects;
    address[] public registeredTokens;

    uint256 public vccInPool;

    event Deposited(address indexed user, address indexed token, uint256 amount, uint256 citMinted);
    event Withdrawn(address indexed user, uint256 citBurned);
    event VccClaimed(address indexed user, uint256 citBurned, uint256 vccReceived);
    event ProjectRegistered(address indexed token);
    event VccAllocated(uint256 amount);

    constructor(address _citToken, address _vccToken) Ownable(msg.sender) {
        citToken = SECToken(_citToken);
        vccToken = ActualCreditToken(_vccToken);
    }

    function registerProject(address _token) external onlyOwner {
        require(!pooledProjects[_token].registered, "Already registered");
        pooledProjects[_token] = PooledProject(0, true);
        registeredTokens.push(_token);
        emit ProjectRegistered(_token);
    }

    /// @notice Deposit project tokens into the pool; receive 1:1 CIT tokens
    function deposit(address _token, uint256 _amount) external {
        PooledProject storage pp = pooledProjects[_token];
        require(pp.registered, "Token not registered");
        require(_amount > 0, "Amount must be > 0");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        pp.totalDeposited += _amount;

        citToken.mint(msg.sender, _amount);

        emit Deposited(msg.sender, _token, _amount, _amount);
    }

    /// @notice Burn CIT to withdraw proportional project tokens from the pool
    function withdraw(uint256 _citAmount) external {
        require(_citAmount > 0, "Amount must be > 0");
        uint256 totalCit = citToken.totalSupply();
        require(totalCit > 0, "No CIT in circulation");

        citToken.burn(msg.sender, _citAmount);

        for (uint256 i = 0; i < registeredTokens.length; i++) {
            address token = registeredTokens[i];
            uint256 poolBalance = IERC20(token).balanceOf(address(this));
            uint256 share = (poolBalance * _citAmount) / totalCit;
            if (share > 0) {
                IERC20(token).safeTransfer(msg.sender, share);
                pooledProjects[token].totalDeposited -= share;
            }
        }

        emit Withdrawn(msg.sender, _citAmount);
    }

    /// @notice Called by CreditManager after partial maturity to allocate VCC to the pool
    function allocateVcc(uint256 _amount) external onlyOwner {
        vccInPool += _amount;
        emit VccAllocated(_amount);
    }

    /// @notice TRUE FCFS: 1 CIT = 1 VCC, capped at available VCC, only burns matching CIT
    function claimVCC(uint256 _citAmount) external {
        require(vccInPool > 0, "No VCC in pool");
        require(_citAmount > 0, "Amount must be > 0");

        uint256 actualClaim = _citAmount > vccInPool ? vccInPool : _citAmount;

        citToken.burn(msg.sender, actualClaim);
        vccInPool -= actualClaim;
        vccToken.transfer(msg.sender, actualClaim);

        emit VccClaimed(msg.sender, actualClaim, actualClaim);
    }

    function registeredTokenCount() external view returns (uint256) {
        return registeredTokens.length;
    }
}
