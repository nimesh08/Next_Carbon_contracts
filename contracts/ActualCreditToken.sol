// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ActualCreditToken -- verified, real-world carbon credit (burnable for retirement)
contract ActualCreditToken is ERC20, ERC20Burnable, Ownable {
    struct CreditMetadata {
        string projectId;
        string vintage;
        string standard;
    }

    mapping(string => CreditMetadata) public creditMeta;

    event CreditsMinted(string indexed projectId, address indexed to, uint256 amount);
    event CreditsRetired(address indexed holder, uint256 amount);

    constructor() ERC20("Actual Carbon Credit", "ACC") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit CreditsMinted("", to, amount);
    }

    function mintForProject(
        address to,
        uint256 amount,
        string calldata _projectId,
        string calldata _vintage,
        string calldata _standard
    ) external onlyOwner {
        creditMeta[_projectId] = CreditMetadata(_projectId, _vintage, _standard);
        _mint(to, amount);
        emit CreditsMinted(_projectId, to, amount);
    }

    /// @notice Owner (CreditManager) can burn from any address in the custodial model
    function burnFrom(address account, uint256 amount) public override {
        if (msg.sender == owner()) {
            _burn(account, amount);
        } else {
            super.burnFrom(account, amount);
        }
    }

    function retire(uint256 amount) external {
        _burn(msg.sender, amount);
        emit CreditsRetired(msg.sender, amount);
    }
}
