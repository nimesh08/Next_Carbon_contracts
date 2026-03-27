import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const wallet = deployer.address;
  console.log("Test wallet:", wallet);

  const fmt = ethers.formatEther;
  const pe = ethers.parseEther;

  function logStep(step: number, action: string, contract: string, fn: string, txHash: string, status: string, details: string) {
    console.log("");
    console.log("[" + step + "] " + action);
    console.log("  Contract: " + contract);
    console.log("  Function: " + fn);
    console.log("  TX: " + txHash);
    console.log("  Status: " + status);
    console.log("  Details: " + details);
    if (txHash !== "N/A") {
      console.log("  Explorer: https://amoy.polygonscan.com/tx/" + txHash);
    }
  }

  const factory = await ethers.getContractAt("ProjectTokenFactory", "0x9e80612E90a20A751268189fF7BD405B06795784");
  const manager = await ethers.getContractAt("CreditManager", "0xCB37B0610e72Bc4a36dF0D149f783F1b32Ef7895");
  const pool = await ethers.getContractAt("CreditPool", "0x62a685D4685b5a54a18E81B3E49c4388D5e7636d");
  const vccToken = await ethers.getContractAt("ActualCreditToken", "0x6ef3FFb5f4ec9f1F08cdC624bF0140E12ba2d09b");
  const citToken = await ethers.getContractAt("SECToken", "0xFbaA40e366755c039794a0240D9AefdfD8bACab0");
  const cert = await ethers.getContractAt("RetirementCertificate", "0x963A6a6E93017De29dD9Ad32485A262ed641087f");
  const poolAddr = await pool.getAddress();
  const managerAddr = await manager.getAddress();

  let tx: any;
  let r: any;

  // === PHASE 1: Create 3 Projects ===
  console.log("\n====== PHASE 1: CREATE PROJECTS ======");

  tx = await factory.createToken("test-alpha", "Test Alpha Carbon", "TALPHA", pe("1000"));
  r = await tx.wait();
  const alphaAddr = await factory.getToken("test-alpha");
  logStep(1, "Create Project Alpha (maxSupply=1000)", "ProjectTokenFactory", "createToken", r.hash, "SUCCESS", "Token: " + alphaAddr);

  tx = await factory.createToken("test-beta", "Test Beta Carbon", "TBETA", pe("500"));
  r = await tx.wait();
  const betaAddr = await factory.getToken("test-beta");
  logStep(2, "Create Project Beta (maxSupply=500)", "ProjectTokenFactory", "createToken", r.hash, "SUCCESS", "Token: " + betaAddr);

  tx = await factory.createToken("test-gamma", "Test Gamma Carbon", "TGAMMA", pe("2000"));
  r = await tx.wait();
  const gammaAddr = await factory.getToken("test-gamma");
  logStep(3, "Create Project Gamma (maxSupply=2000)", "ProjectTokenFactory", "createToken", r.hash, "SUCCESS", "Token: " + gammaAddr);

  const alpha = await ethers.getContractAt("ProjectToken", alphaAddr);
  const beta = await ethers.getContractAt("ProjectToken", betaAddr);
  const gamma = await ethers.getContractAt("ProjectToken", gammaAddr);

  // Set Manager
  tx = await alpha.setManager(managerAddr); r = await tx.wait();
  logStep(4, "setManager on Alpha", "ProjectToken(Alpha)", "setManager", r.hash, "SUCCESS", "Manager = CreditManager");

  tx = await beta.setManager(managerAddr); r = await tx.wait();
  logStep(5, "setManager on Beta", "ProjectToken(Beta)", "setManager", r.hash, "SUCCESS", "Manager = CreditManager");

  tx = await gamma.setManager(managerAddr); r = await tx.wait();
  logStep(6, "setManager on Gamma", "ProjectToken(Gamma)", "setManager", r.hash, "SUCCESS", "Manager = CreditManager");

  // Register in CreditManager
  tx = await manager.registerProject("test-alpha"); r = await tx.wait();
  logStep(7, "Register Alpha in CreditManager", "CreditManager", "registerProject(test-alpha)", r.hash, "SUCCESS", "Registered");

  tx = await manager.registerProject("test-beta"); r = await tx.wait();
  logStep(8, "Register Beta in CreditManager", "CreditManager", "registerProject(test-beta)", r.hash, "SUCCESS", "Registered");

  tx = await manager.registerProject("test-gamma"); r = await tx.wait();
  logStep(9, "Register Gamma in CreditManager", "CreditManager", "registerProject(test-gamma)", r.hash, "SUCCESS", "Registered");

  // === PHASE 2: MINTING ===
  console.log("\n====== PHASE 2: MINTING ======");

  tx = await alpha.mint(wallet, pe("800")); r = await tx.wait();
  logStep(10, "Mint 800 Alpha PT", "ProjectToken(Alpha)", "mint(wallet, 800)", r.hash, "SUCCESS", "Balance: " + fmt(await alpha.balanceOf(wallet)));

  tx = await beta.mint(wallet, pe("400")); r = await tx.wait();
  logStep(11, "Mint 400 Beta PT", "ProjectToken(Beta)", "mint(wallet, 400)", r.hash, "SUCCESS", "Balance: " + fmt(await beta.balanceOf(wallet)));

  tx = await gamma.mint(wallet, pe("1500")); r = await tx.wait();
  logStep(12, "Mint 1500 Gamma PT", "ProjectToken(Gamma)", "mint(wallet, 1500)", r.hash, "SUCCESS", "Balance: " + fmt(await gamma.balanceOf(wallet)));

  try {
    tx = await alpha.mint(wallet, pe("300"));
    await tx.wait();
    logStep(13, "Mint beyond maxSupply SHOULD FAIL", "ProjectToken(Alpha)", "mint(wallet, 300)", "N/A", "BUG", "Did not revert!");
  } catch (e: any) {
    logStep(13, "Mint beyond maxSupply (expected revert)", "ProjectToken(Alpha)", "mint(wallet, 300)", "N/A", "REVERTED", "Correctly blocked: Exceeds max supply");
  }

  // === PHASE 3: POOL DEPOSITS ===
  console.log("\n====== PHASE 3: MULTI-PROJECT POOL DEPOSITS ======");

  tx = await alpha.approve(poolAddr, pe("200")); await tx.wait();
  tx = await pool.deposit(alphaAddr, pe("200")); r = await tx.wait();
  logStep(14, "Deposit 200 Alpha PT to pool", "CreditPool", "deposit(alpha, 200)", r.hash, "SUCCESS", "CIT: " + fmt(await citToken.balanceOf(wallet)));

  tx = await beta.approve(poolAddr, pe("150")); await tx.wait();
  tx = await pool.deposit(betaAddr, pe("150")); r = await tx.wait();
  logStep(15, "Deposit 150 Beta PT to pool", "CreditPool", "deposit(beta, 150)", r.hash, "SUCCESS", "CIT: " + fmt(await citToken.balanceOf(wallet)));

  tx = await gamma.approve(poolAddr, pe("300")); await tx.wait();
  tx = await pool.deposit(gammaAddr, pe("300")); r = await tx.wait();
  logStep(16, "Deposit 300 Gamma PT to pool", "CreditPool", "deposit(gamma, 300)", r.hash, "SUCCESS", "CIT: " + fmt(await citToken.balanceOf(wallet)));

  console.log("");
  console.log("[17] POOL COMPOSITION (read-only)");
  console.log("  Alpha in pool: " + fmt(await alpha.balanceOf(poolAddr)));
  console.log("  Beta in pool: " + fmt(await beta.balanceOf(poolAddr)));
  console.log("  Gamma in pool: " + fmt(await gamma.balanceOf(poolAddr)));
  console.log("  Total CIT supply: " + fmt(await citToken.totalSupply()));
  console.log("  Wallet CIT: " + fmt(await citToken.balanceOf(wallet)));

  // === PHASE 4: PARTIAL MATURITY - ALPHA 10% ===
  console.log("\n====== PHASE 4: PARTIAL MATURITY (ALPHA 10%) ======");

  const wA1 = fmt(await alpha.balanceOf(wallet));
  const pA1 = fmt(await alpha.balanceOf(poolAddr));
  tx = await manager.partialMature("test-alpha", 10);
  r = await tx.wait();
  logStep(18, "Mature Alpha 10%", "CreditManager", "partialMature(test-alpha, 10)", r.hash, "SUCCESS",
    "Wallet PT: " + wA1 + " -> " + fmt(await alpha.balanceOf(wallet)) +
    " | Pool PT: " + pA1 + " -> " + fmt(await alpha.balanceOf(poolAddr)) +
    " | VCC wallet: " + fmt(await vccToken.balanceOf(wallet)) +
    " | VCC pool: " + fmt(await pool.vccInPool()));

  // === PHASE 5: MATURE BETA 25%, GAMMA 50% ===
  console.log("\n====== PHASE 5: MATURE BETA 25% & GAMMA 50% ======");

  tx = await manager.partialMature("test-beta", 25);
  r = await tx.wait();
  logStep(19, "Mature Beta 25%", "CreditManager", "partialMature(test-beta, 25)", r.hash, "SUCCESS",
    "Beta wallet: " + fmt(await beta.balanceOf(wallet)) +
    " | Beta pool: " + fmt(await beta.balanceOf(poolAddr)) +
    " | VCC wallet: " + fmt(await vccToken.balanceOf(wallet)) +
    " | VCC pool: " + fmt(await pool.vccInPool()));

  tx = await manager.partialMature("test-gamma", 50);
  r = await tx.wait();
  logStep(20, "Mature Gamma 50%", "CreditManager", "partialMature(test-gamma, 50)", r.hash, "SUCCESS",
    "Gamma wallet: " + fmt(await gamma.balanceOf(wallet)) +
    " | Gamma pool: " + fmt(await gamma.balanceOf(poolAddr)) +
    " | VCC wallet: " + fmt(await vccToken.balanceOf(wallet)) +
    " | VCC pool: " + fmt(await pool.vccInPool()));

  console.log("");
  console.log("[21] STATE AFTER 3 MATURITIES");
  console.log("  VCC in wallet: " + fmt(await vccToken.balanceOf(wallet)));
  console.log("  VCC in pool: " + fmt(await pool.vccInPool()));

  // === PHASE 6: FCFS CLAIMING ===
  console.log("\n====== PHASE 6: TRUE FCFS CLAIMING ======");

  const citB1 = fmt(await citToken.balanceOf(wallet));
  const vccB1 = fmt(await vccToken.balanceOf(wallet));
  tx = await pool.claimVCC(pe("50"));
  r = await tx.wait();
  logStep(22, "Claim 50 VCC (within available)", "CreditPool", "claimVCC(50)", r.hash, "SUCCESS",
    "CIT: " + citB1 + " -> " + fmt(await citToken.balanceOf(wallet)) +
    " | VCC: " + vccB1 + " -> " + fmt(await vccToken.balanceOf(wallet)) +
    " | Pool VCC left: " + fmt(await pool.vccInPool()));

  const vccRem = await pool.vccInPool();
  const citB2 = fmt(await citToken.balanceOf(wallet));
  tx = await pool.claimVCC(pe("9999"));
  r = await tx.wait();
  logStep(23, "Claim 9999 VCC (capped at " + fmt(vccRem) + ")", "CreditPool", "claimVCC(9999)", r.hash, "SUCCESS",
    "CIT: " + citB2 + " -> " + fmt(await citToken.balanceOf(wallet)) +
    " | VCC: " + fmt(await vccToken.balanceOf(wallet)) +
    " | Pool VCC left: " + fmt(await pool.vccInPool()));

  try {
    tx = await pool.claimVCC(pe("10"));
    await tx.wait();
    logStep(24, "Claim when 0 VCC SHOULD FAIL", "CreditPool", "claimVCC(10)", "N/A", "BUG", "Did not revert!");
  } catch (e: any) {
    logStep(24, "Claim when 0 VCC (expected revert)", "CreditPool", "claimVCC(10)", "N/A", "REVERTED", "Correctly blocked: No VCC in pool");
  }

  // === PHASE 7: ATOMIC OFFSET + NFT ===
  console.log("\n====== PHASE 7: ATOMIC OFFSET + NFT ======");

  const vccBO = fmt(await vccToken.balanceOf(wallet));
  tx = await manager.offset(wallet, pe("30"), "test-alpha", "https://certs.example.com/alpha-1");
  r = await tx.wait();
  logStep(25, "Offset 30 VCC (Alpha) + Mint NFT #1", "CreditManager", "offset(wallet, 30, test-alpha, uri)", r.hash, "SUCCESS",
    "VCC: " + vccBO + " -> " + fmt(await vccToken.balanceOf(wallet)) +
    " | NFTs: " + (await cert.balanceOf(wallet)).toString());

  tx = await manager.offset(wallet, pe("50"), "test-gamma", "https://certs.example.com/gamma-1");
  r = await tx.wait();
  logStep(26, "Offset 50 VCC (Gamma) + Mint NFT #2", "CreditManager", "offset(wallet, 50, test-gamma, uri)", r.hash, "SUCCESS",
    "VCC: " + fmt(await vccToken.balanceOf(wallet)) +
    " | NFTs: " + (await cert.balanceOf(wallet)).toString());

  const c1 = await cert.certificates(1);
  const c2 = await cert.certificates(2);
  console.log("");
  console.log("[27] NFT #1: amount=" + fmt(c1.amount) + " project=" + c1.projectId + " retiree=" + c1.retiree);
  console.log("[28] NFT #2: amount=" + fmt(c2.amount) + " project=" + c2.projectId + " retiree=" + c2.retiree);

  // === PHASE 8: WITHDRAW FROM POOL ===
  console.log("\n====== PHASE 8: WITHDRAW FROM POOL ======");

  const citBal = await citToken.balanceOf(wallet);
  if (citBal > 0n) {
    const wAmt = citBal < pe("100") ? citBal : pe("100");
    const aW = fmt(await alpha.balanceOf(wallet));
    const bW = fmt(await beta.balanceOf(wallet));
    const gW = fmt(await gamma.balanceOf(wallet));
    tx = await pool.withdraw(wAmt);
    r = await tx.wait();
    logStep(29, "Withdraw " + fmt(wAmt) + " CIT", "CreditPool", "withdraw", r.hash, "SUCCESS",
      "Alpha: " + aW + " -> " + fmt(await alpha.balanceOf(wallet)) +
      " | Beta: " + bW + " -> " + fmt(await beta.balanceOf(wallet)) +
      " | Gamma: " + gW + " -> " + fmt(await gamma.balanceOf(wallet)));
  } else {
    console.log("[29] SKIP: No CIT to withdraw");
  }

  // === PHASE 9: SECOND MATURITY ROUND ===
  console.log("\n====== PHASE 9: SECOND MATURITY ROUND ======");

  const aW2 = fmt(await alpha.balanceOf(wallet));
  const aP2 = fmt(await alpha.balanceOf(poolAddr));
  tx = await manager.partialMature("test-alpha", 30);
  r = await tx.wait();
  logStep(30, "2nd maturity Alpha +30%", "CreditManager", "partialMature(test-alpha, 30)", r.hash, "SUCCESS",
    "Alpha wallet: " + aW2 + " -> " + fmt(await alpha.balanceOf(wallet)) +
    " | Alpha pool: " + aP2 + " -> " + fmt(await alpha.balanceOf(poolAddr)) +
    " | VCC wallet: " + fmt(await vccToken.balanceOf(wallet)) +
    " | VCC pool: " + fmt(await pool.vccInPool()));

  // === FINAL SUMMARY ===
  console.log("\n========================================");
  console.log("FINAL STATE SUMMARY");
  console.log("========================================");
  console.log("Alpha PT - Wallet: " + fmt(await alpha.balanceOf(wallet)) + " | Pool: " + fmt(await alpha.balanceOf(poolAddr)));
  console.log("Beta PT  - Wallet: " + fmt(await beta.balanceOf(wallet)) + " | Pool: " + fmt(await beta.balanceOf(poolAddr)));
  console.log("Gamma PT - Wallet: " + fmt(await gamma.balanceOf(wallet)) + " | Pool: " + fmt(await gamma.balanceOf(poolAddr)));
  console.log("VCC      - Wallet: " + fmt(await vccToken.balanceOf(wallet)));
  console.log("VCC Pool : " + fmt(await pool.vccInPool()));
  console.log("CIT      - Wallet: " + fmt(await citToken.balanceOf(wallet)));
  console.log("NFTs     - Wallet: " + (await cert.balanceOf(wallet)).toString());
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
