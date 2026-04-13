// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ProjectToken.sol";
import "./ProjectTokenFactory.sol";
import "./CreditPool.sol";
import "./ActualCreditToken.sol";
import "./RetirementCertificate.sol";

/// @title CreditManager - Orchestrator for the entire carbon credit token lifecycle
contract CreditManager is Ownable {
    ProjectTokenFactory public factory;
    CreditPool public pool;
    ActualCreditToken public vccToken;
    RetirementCertificate public certificate;

    struct ProjectInfo {
        address tokenAddress;
        bool registered;
    }

    mapping(string => ProjectInfo) public projects;

    event ProjectRegistered(string indexed projectId, address tokenAddress);
    event PartialMaturity(string indexed projectId, uint256 percent, uint256 walletBurned, uint256 poolBurned, uint256 vccMinted);
    event CreditsOffset(address indexed holder, uint256 amount, string projectId, uint256 certificateId);

    constructor(
        address _factory,
        address _pool,
        address _vccToken,
        address _certificate
    ) Ownable(msg.sender) {
        factory = ProjectTokenFactory(_factory);
        pool = CreditPool(_pool);
        vccToken = ActualCreditToken(_vccToken);
        certificate = RetirementCertificate(_certificate);
    }

    function registerProject(string calldata _projectId) external onlyOwner {
        address tokenAddr = factory.getToken(_projectId);
        require(tokenAddr != address(0), "Token not deployed via factory");
        require(!projects[_projectId].registered, "Already registered");

        projects[_projectId] = ProjectInfo(tokenAddr, true);
        pool.registerProject(tokenAddr);

        emit ProjectRegistered(_projectId, tokenAddr);
    }

    /// @notice Partial maturity: burns X% of PT from company wallet AND pool, mints VCC to both
    /// @param _projectId The project to mature
    /// @param _percent Percentage to mature (1-100), applied to current PT balances
    function partialMature(
        string calldata _projectId,
        uint256 _percent
    ) external onlyOwner {
        require(_percent > 0 && _percent <= 100, "Percent must be 1-100");
        ProjectInfo storage info = projects[_projectId];
        require(info.registered, "Project not registered");

        ProjectToken pt = ProjectToken(info.tokenAddress);
        uint256 walletBalance = pt.balanceOf(owner());
        uint256 poolBalance = pt.balanceOf(address(pool));

        uint256 walletBurn = (walletBalance * _percent) / 100;
        walletBurn = (walletBurn / 1e18) * 1e18; // truncate to whole token units
        uint256 poolBurn = (poolBalance * _percent) / 100;
        poolBurn = (poolBurn / 1e18) * 1e18; // truncate to whole token units
        uint256 totalVcc = walletBurn + poolBurn;

        require(totalVcc > 0, "Nothing to mature");

        if (walletBurn > 0) {
            pt.burnFrom(owner(), walletBurn);
            vccToken.mint(owner(), walletBurn);
        }

        if (poolBurn > 0) {
            pt.burnFrom(address(pool), poolBurn);
            vccToken.mint(address(pool), poolBurn);
            pool.allocateVcc(poolBurn);
        }

        emit PartialMaturity(_projectId, _percent, walletBurn, poolBurn, totalVcc);
    }

    /// @notice Atomic offset: burns VCC and mints NFT certificate in a single transaction
    function offset(
        address _holder,
        uint256 _amount,
        string calldata _projectId,
        string calldata _certificateURI
    ) external onlyOwner returns (uint256 certificateId) {
        require(_amount > 0, "Amount must be > 0");

        vccToken.burnFrom(_holder, _amount);
        certificateId = certificate.mint(_holder, _amount, _projectId, _certificateURI);

        emit CreditsOffset(_holder, _amount, _projectId, certificateId);
    }

    /// @notice Admin-only: mint VCC tokens (for corrections or manual airdrops)
    function mintVcc(address to, uint256 amount) external onlyOwner {
        vccToken.mint(to, amount);
    }
}
