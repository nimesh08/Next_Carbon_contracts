// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ProjectToken.sol";
import "./ProjectTokenFactory.sol";
import "./CreditPool.sol";
import "./ActualCreditToken.sol";

/// @title CreditManager -- orchestrator that ties the entire token lifecycle together
contract CreditManager is Ownable {
    ProjectTokenFactory public factory;
    CreditPool public pool;
    ActualCreditToken public accToken;

    struct ProjectInfo {
        address tokenAddress;
        uint256 weight;
        bool mature;
    }

    mapping(string => ProjectInfo) public projects;

    event ProjectRegistered(string indexed projectId, address tokenAddress, uint256 weight);
    event ProjectMatured(string indexed projectId, uint256 rtpBurned, uint256 accMinted);
    event CreditsOffset(address indexed holder, uint256 amount);

    constructor(
        address _factory,
        address _pool,
        address _accToken
    ) Ownable(msg.sender) {
        factory = ProjectTokenFactory(_factory);
        pool = CreditPool(_pool);
        accToken = ActualCreditToken(_accToken);
    }

    function registerProject(
        string calldata _projectId,
        uint256 _weight
    ) external onlyOwner {
        address tokenAddr = factory.getToken(_projectId);
        require(tokenAddr != address(0), "Token not deployed via factory");
        require(projects[_projectId].tokenAddress == address(0), "Already registered");

        projects[_projectId] = ProjectInfo(tokenAddr, _weight, false);

        pool.registerProject(tokenAddr, _weight);

        emit ProjectRegistered(_projectId, tokenAddr, _weight);
    }

    /// @notice Mature a project: burn all RTP from company wallet, mint ACC 1:1
    /// @dev In our custodial model the company wallet holds all user tokens,
    ///      so we burn from the company wallet and mint ACC to it. The backend
    ///      updates individual user balances in Supabase.
    function mature(string calldata _projectId) external onlyOwner {
        ProjectInfo storage info = projects[_projectId];
        require(info.tokenAddress != address(0), "Project not registered");
        require(!info.mature, "Already matured");

        ProjectToken pt = ProjectToken(info.tokenAddress);
        uint256 companyBalance = pt.balanceOf(owner());

        uint256 poolBalance = pt.balanceOf(address(pool));

        uint256 totalBurned = companyBalance + poolBalance;

        if (companyBalance > 0) {
            pt.burnFrom(owner(), companyBalance);
            accToken.mint(owner(), companyBalance);
        }

        if (poolBalance > 0) {
            pt.burnFrom(address(pool), poolBalance);
            accToken.mint(address(pool), poolBalance);
            pool.allocateAcc(poolBalance);
        }

        info.mature = true;

        emit ProjectMatured(_projectId, totalBurned, totalBurned);
    }

    /// @notice Retire/offset ACC tokens (permanent removal from circulation)
    function offset(address holder, uint256 amount) external onlyOwner {
        accToken.burnFrom(holder, amount);
        emit CreditsOffset(holder, amount);
    }

    /// @notice Admin-only: mint ACC tokens (for manual airdrops or corrections)
    function mintAcc(address to, uint256 amount) external onlyOwner {
        accToken.mint(to, amount);
    }
}
