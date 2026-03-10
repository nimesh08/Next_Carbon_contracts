// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ProjectToken (Right-to-Play token for a single carbon project)
contract ProjectToken is ERC20, ERC20Burnable, Ownable {
    string public projectId;
    address public manager;

    modifier onlyOwnerOrManager() {
        require(msg.sender == owner() || msg.sender == manager, "Not authorized");
        _;
    }

    constructor(
        string memory _projectId,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        projectId = _projectId;
    }

    function setManager(address _manager) external onlyOwner {
        manager = _manager;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn tokens from any account -- callable by owner or CreditManager
    function burnFrom(address account, uint256 amount) public override onlyOwnerOrManager {
        _burn(account, amount);
    }
}
