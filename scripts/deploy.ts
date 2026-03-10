import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");

  // 1. Deploy ActualCreditToken
  const AccFactory = await ethers.getContractFactory("ActualCreditToken");
  const accToken = await AccFactory.deploy();
  await accToken.waitForDeployment();
  const accAddr = await accToken.getAddress();
  console.log("ActualCreditToken deployed to:", accAddr);

  // 2. Deploy SECToken
  const SecFactory = await ethers.getContractFactory("SECToken");
  const secToken = await SecFactory.deploy();
  await secToken.waitForDeployment();
  const secAddr = await secToken.getAddress();
  console.log("SECToken deployed to:", secAddr);

  // 3. Deploy CreditPool
  const PoolFactory = await ethers.getContractFactory("CreditPool");
  const creditPool = await PoolFactory.deploy(secAddr, accAddr);
  await creditPool.waitForDeployment();
  const poolAddr = await creditPool.getAddress();
  console.log("CreditPool deployed to:", poolAddr);

  // 4. Set CreditPool as the authorized minter/burner on SECToken
  const setPoolTx = await secToken.setCreditPool(poolAddr);
  await setPoolTx.wait();
  console.log("SECToken.creditPool set to:", poolAddr);

  // 5. Deploy ProjectTokenFactory
  const FactoryFactory = await ethers.getContractFactory("ProjectTokenFactory");
  const factory = await FactoryFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("ProjectTokenFactory deployed to:", factoryAddr);

  // 6. Deploy CreditManager
  const ManagerFactory = await ethers.getContractFactory("CreditManager");
  const manager = await ManagerFactory.deploy(factoryAddr, poolAddr, accAddr);
  await manager.waitForDeployment();
  const managerAddr = await manager.getAddress();
  console.log("CreditManager deployed to:", managerAddr);

  // 7. Transfer CreditPool ownership to CreditManager so it can call allocateAcc / registerProject
  const transferPoolTx = await creditPool.transferOwnership(managerAddr);
  await transferPoolTx.wait();
  console.log("CreditPool ownership transferred to CreditManager");

  // 8. Transfer ActualCreditToken ownership to CreditManager so it can mint/burn ACC
  const transferAccTx = await accToken.transferOwnership(managerAddr);
  await transferAccTx.wait();
  console.log("ActualCreditToken ownership transferred to CreditManager");

  // 9. Grant CreditManager approval to burn ACC from deployer wallet (for offset)
  const approveAccTx = await accToken.approve(managerAddr, ethers.MaxUint256);
  await approveAccTx.wait();
  console.log("ACC token approved for CreditManager");

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE -- Save these addresses in your .env:");
  console.log("========================================");
  console.log(`ACTUAL_CREDIT_ADDRESS=${accAddr}`);
  console.log(`SEC_TOKEN_ADDRESS=${secAddr}`);
  console.log(`CREDIT_POOL_ADDRESS=${poolAddr}`);
  console.log(`PROJECT_TOKEN_FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`CREDIT_MANAGER_ADDRESS=${managerAddr}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
