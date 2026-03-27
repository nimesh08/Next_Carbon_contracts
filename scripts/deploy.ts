import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "MATIC"
  );

  // 1. Deploy RetirementCertificate (ERC-721)
  const CertFactory = await ethers.getContractFactory("RetirementCertificate");
  const certificate = await CertFactory.deploy();
  await certificate.waitForDeployment();
  const certAddr = await certificate.getAddress();
  console.log("RetirementCertificate deployed to:", certAddr);

  // 2. Deploy ActualCreditToken (VCC)
  const VccFactory = await ethers.getContractFactory("ActualCreditToken");
  const vccToken = await VccFactory.deploy();
  await vccToken.waitForDeployment();
  const vccAddr = await vccToken.getAddress();
  console.log("ActualCreditToken (VCC) deployed to:", vccAddr);

  // 3. Deploy SECToken (CIT)
  const CitFactory = await ethers.getContractFactory("SECToken");
  const citToken = await CitFactory.deploy();
  await citToken.waitForDeployment();
  const citAddr = await citToken.getAddress();
  console.log("SECToken (CIT) deployed to:", citAddr);

  // 4. Deploy CreditPool
  const PoolFactory = await ethers.getContractFactory("CreditPool");
  const pool = await PoolFactory.deploy(citAddr, vccAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("CreditPool deployed to:", poolAddr);

  // 5. Set CreditPool as the authorized minter/burner on CIT
  const setPoolTx = await citToken.setCreditPool(poolAddr);
  await setPoolTx.wait();
  console.log("SECToken.creditPool set to:", poolAddr);

  // 6. Deploy ProjectTokenFactory
  const FactFactory = await ethers.getContractFactory("ProjectTokenFactory");
  const factory = await FactFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("ProjectTokenFactory deployed to:", factoryAddr);

  // 7. Deploy CreditManager
  const MgrFactory = await ethers.getContractFactory("CreditManager");
  const mgr = await MgrFactory.deploy(factoryAddr, poolAddr, vccAddr, certAddr);
  await mgr.waitForDeployment();
  const mgrAddr = await mgr.getAddress();
  console.log("CreditManager deployed to:", mgrAddr);

  // 8. Transfer CreditPool ownership to CreditManager
  await (await pool.transferOwnership(mgrAddr)).wait();
  console.log("CreditPool ownership -> CreditManager");

  // 9. Transfer VCC ownership to CreditManager
  await (await vccToken.transferOwnership(mgrAddr)).wait();
  console.log("ActualCreditToken ownership -> CreditManager");

  // 10. Transfer RetirementCertificate ownership to CreditManager
  await (await certificate.transferOwnership(mgrAddr)).wait();
  console.log("RetirementCertificate ownership -> CreditManager");

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log(`ACTUAL_CREDIT_ADDRESS=${vccAddr}`);
  console.log(`SEC_TOKEN_ADDRESS=${citAddr}`);
  console.log(`CREDIT_POOL_ADDRESS=${poolAddr}`);
  console.log(`PROJECT_TOKEN_FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`CREDIT_MANAGER_ADDRESS=${mgrAddr}`);
  console.log(`RETIREMENT_CERTIFICATE_ADDRESS=${certAddr}`);
  console.log("========================================");
  console.log(
    "\nIMPORTANT: For each ProjectToken created via the factory,"
  );
  console.log(
    "run projectToken.setManager(CreditManagerAddress) from the"
  );
  console.log("company wallet, otherwise partialMature will REVERT.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
