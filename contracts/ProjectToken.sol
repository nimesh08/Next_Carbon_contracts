// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ProjectToken - ERC-20 representing fractional ownership in a single carbon project
contract ProjectToken is ERC20, ERC20Burnable, Ownable {
    string public projectId;
    address public manager;
    uint256 public maxSupply;

    modifier onlyOwnerOrManager() {
        require(msg.sender == owner() || msg.sender == manager, "Not authorized");
        _;
    }

    constructor(
        string memory _projectId,
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _maxSupply
    ) ERC20(_name, _symbol) Ownable(_owner) {
        projectId = _projectId;
        maxSupply = _maxSupply;
    }

    function setManager(address _manager) external onlyOwner {
        manager = _manager;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        _mint(to, amount);
    }

    /// @notice Burn tokens from any account - callable by owner or CreditManager
    function burnFrom(address account, uint256 amount) public override onlyOwnerOrManager {
        _burn(account, amount);
    }
}
