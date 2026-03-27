// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ProjectToken.sol";

/// @title Factory that deploys one ERC-20 ProjectToken per carbon project
contract ProjectTokenFactory is Ownable {
    mapping(string => address) public projectTokens;
    string[] public projectIds;

    event ProjectTokenCreated(
        string indexed projectId,
        address tokenAddress,
        string name,
        string symbol,
        uint256 maxSupply
    );

    constructor() Ownable(msg.sender) {}

    function createToken(
        string calldata _projectId,
        string calldata _name,
        string calldata _symbol,
        uint256 _maxSupply
    ) external onlyOwner returns (address) {
        require(projectTokens[_projectId] == address(0), "Token already exists for project");
        require(_maxSupply > 0, "Max supply must be > 0");

        ProjectToken token = new ProjectToken(_projectId, _name, _symbol, owner(), _maxSupply);
        projectTokens[_projectId] = address(token);
        projectIds.push(_projectId);

        emit ProjectTokenCreated(_projectId, address(token), _name, _symbol, _maxSupply);
        return address(token);
    }

    function getToken(string calldata _projectId) external view returns (address) {
        return projectTokens[_projectId];
    }

    function totalProjects() external view returns (uint256) {
        return projectIds.length;
    }
}
