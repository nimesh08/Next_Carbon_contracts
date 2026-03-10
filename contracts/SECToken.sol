// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SECToken -- pooled liquidity index token, only mintable/burnable by CreditPool
contract SECToken is ERC20, Ownable {
    address public creditPool;

    modifier onlyPool() {
        require(msg.sender == creditPool, "Only CreditPool");
        _;
    }

    constructor() ERC20("SEC Carbon Index", "SEC") Ownable(msg.sender) {}

    function setCreditPool(address _pool) external onlyOwner {
        creditPool = _pool;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}
