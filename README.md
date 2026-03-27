# Next Carbon - Smart Contracts

Solidity smart contracts for the carbon credit tokenization platform deployed on Polygon Amoy.

## Tech Stack

- **Solidity 0.8.24** (EVM version: cancun)
- **OpenZeppelin v5.6.1** (Ownable, ERC-20, ERC-721, SafeERC20)
- **Hardhat v2** for compilation, testing, deployment

## Contracts

| Contract | Type | Description |
|----------|------|-------------|
| `ProjectTokenFactory` | Factory | Deploys unique ERC-20 tokens per carbon project |
| `ProjectToken` | ERC-20 | Fractional ownership in a carbon project (with maxSupply) |
| `CreditManager` | Orchestrator | Handles maturity, offset, project registration |
| `CreditPool` | Pool | Multi-project pool with FCFS VCC claiming |
| `SECToken` (CIT) | ERC-20 | Carbon Index Token - pool receipt token |
| `ActualCreditToken` (VCC) | ERC-20 | Verified Carbon Credit - actual carbon credits |
| `RetirementCertificate` | ERC-721 | NFT retirement certificate |

## Deployed Addresses (Polygon Amoy)

| Contract | Address |
|----------|---------|
| ProjectTokenFactory | `0x9e80612E90a20A751268189fF7BD405B06795784` |
| CreditManager | `0xCB37B0610e72Bc4a36dF0D149f783F1b32Ef7895` |
| CreditPool | `0x62a685D4685b5a54a18E81B3E49c4388D5e7636d` |
| ActualCreditToken (VCC) | `0x6ef3FFb5f4ec9f1F08cdC624bF0140E12ba2d09b` |
| SECToken (CIT) | `0xFbaA40e366755c039794a0240D9AefdfD8bACab0` |
| RetirementCertificate | `0x963A6a6E93017De29dD9Ad32485A262ed641087f` |

Company Wallet: `0x74C744D91650Ce734B3D8b00eCC98d8B8043edE3`

## Environment Variables

Create a `.env` file:

```env
INFURA_API_URL=https://rpc-amoy.polygon.technology
PRIVATE_KEY=your-deployer-private-key
```

## Development

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Deployment

```bash
npx hardhat run scripts/deploy.ts --network amoy
```

**Important:** After deployment, call `setManager(CreditManagerAddress)` on each ProjectToken from the Company Wallet.

## Testing

Run the full test suite:

```bash
npx hardhat test
```

Run live testnet tests:

```bash
npx hardhat run scripts/live-test.ts --network amoy
```

## Key Mechanisms

### Partial Maturity (100% On-Chain)

```solidity
function partialMature(string projectId, uint256 percent) external onlyOwner {
    // Reads balances ON-CHAIN
    uint256 walletBurn = pt.balanceOf(owner()) * percent / 100;
    uint256 poolBurn = pt.balanceOf(pool) * percent / 100;
    
    // Burns PT, mints VCC - ATOMIC
    pt.burnFrom(owner(), walletBurn);
    vccToken.mint(owner(), walletBurn);
    pt.burnFrom(pool, poolBurn);
    vccToken.mint(pool, poolBurn);
}
```

### FCFS Claiming

```solidity
function claimVCC(uint256 citAmount) external {
    // Cap at available VCC
    uint256 actualClaim = citAmount > vccInPool ? vccInPool : citAmount;
    
    // Only burn matching CIT
    citToken.burn(msg.sender, actualClaim);
    vccToken.transfer(msg.sender, actualClaim);
}
```

### Atomic Offset + NFT

```solidity
function offset(address holder, uint256 amount, string projectId, string uri) 
    external onlyOwner returns (uint256 certificateId) 
{
    vccToken.burnFrom(holder, amount);  // Burn VCC
    certificateId = certificate.mint(holder, amount, projectId, uri);  // Mint NFT
    // Both in ONE atomic transaction
}
```

## Project Structure

```
contracts/
├── ProjectTokenFactory.sol   # Factory for deploying PT contracts
├── ProjectToken.sol          # ERC-20 with maxSupply and manager role
├── CreditManager.sol         # Central orchestrator
├── CreditPool.sol            # Multi-project pool with FCFS
├── SECToken.sol              # CIT (pool receipt token)
├── ActualCreditToken.sol     # VCC (verified carbon credit)
└── RetirementCertificate.sol # ERC-721 NFT certificate

scripts/
├── deploy.ts                 # Deployment script
└── live-test.ts              # Live testnet test scenarios

test/
└── CreditSystem.test.ts      # Full test suite
```

## Verification

Verify contracts on PolygonScan:

```bash
npx hardhat verify --network amoy CONTRACT_ADDRESS "constructor" "args"
```

## License

MIT
