import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ProjectTokenFactory,
  ProjectToken,
  SECToken,
  CreditPool,
  ActualCreditToken,
  CreditManager,
  RetirementCertificate,
} from "../typechain-types";

describe("Carbon Credit Token System", function () {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let factory: ProjectTokenFactory;
  let citToken: SECToken;
  let vccToken: ActualCreditToken;
  let pool: CreditPool;
  let manager: CreditManager;
  let certificate: RetirementCertificate;

  const PROJECT_A = "project-alpha";
  const PROJECT_B = "project-beta";
  const MAX_SUPPLY_A = ethers.parseEther("10000");
  const MAX_SUPPLY_B = ethers.parseEther("5000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const VccFactory = await ethers.getContractFactory("ActualCreditToken");
    vccToken = await VccFactory.deploy();

    const CitFactory = await ethers.getContractFactory("SECToken");
    citToken = await CitFactory.deploy();

    const CertFactory = await ethers.getContractFactory("RetirementCertificate");
    certificate = await CertFactory.deploy();

    const PoolFactory = await ethers.getContractFactory("CreditPool");
    pool = await PoolFactory.deploy(await citToken.getAddress(), await vccToken.getAddress());

    await citToken.setCreditPool(await pool.getAddress());

    const FactoryFactory = await ethers.getContractFactory("ProjectTokenFactory");
    factory = await FactoryFactory.deploy();

    const ManagerFactory = await ethers.getContractFactory("CreditManager");
    manager = await ManagerFactory.deploy(
      await factory.getAddress(),
      await pool.getAddress(),
      await vccToken.getAddress(),
      await certificate.getAddress()
    );

    await pool.transferOwnership(await manager.getAddress());
    await vccToken.transferOwnership(await manager.getAddress());
    await certificate.transferOwnership(await manager.getAddress());
  });

  describe("ProjectTokenFactory", function () {
    it("should deploy a new project token with maxSupply", async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      const addr = await factory.getToken(PROJECT_A);
      expect(addr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.totalProjects()).to.equal(1);

      const token = await ethers.getContractAt("ProjectToken", addr);
      expect(await token.maxSupply()).to.equal(MAX_SUPPLY_A);
    });

    it("should reject duplicate project IDs", async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      await expect(
        factory.createToken(PROJECT_A, "Alpha Carbon 2", "ALPHA2", MAX_SUPPLY_A)
      ).to.be.revertedWith("Token already exists for project");
    });

    it("should reject zero maxSupply", async function () {
      await expect(
        factory.createToken(PROJECT_A, "Alpha", "A", 0)
      ).to.be.revertedWith("Max supply must be > 0");
    });
  });

  describe("ProjectToken - MaxSupply", function () {
    let tokenA: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
    });

    it("should mint within maxSupply", async function () {
      await tokenA.mint(owner.address, MAX_SUPPLY_A);
      expect(await tokenA.balanceOf(owner.address)).to.equal(MAX_SUPPLY_A);
    });

    it("should reject minting beyond maxSupply", async function () {
      await tokenA.mint(owner.address, MAX_SUPPLY_A);
      await expect(
        tokenA.mint(owner.address, 1)
      ).to.be.revertedWith("Exceeds max supply");
    });

    it("should only allow owner to mint", async function () {
      await expect(
        tokenA.connect(user1).mint(user1.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(tokenA, "OwnableUnauthorizedAccount");
    });

    it("should allow burnFrom by manager", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("100"));
      await tokenA.setManager(user1.address);
      await tokenA.connect(user1).burnFrom(owner.address, ethers.parseEther("50"));
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("50"));
    });

    it("should reject burnFrom by non-authorized address", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("100"));
      await expect(
        tokenA.connect(user2).burnFrom(owner.address, ethers.parseEther("50"))
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("CreditPool - Deposit & Withdraw (1:1 CIT)", function () {
    let tokenA: ProjectToken;
    let tokenB: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      await factory.createToken(PROJECT_B, "Beta Carbon", "BETA", MAX_SUPPLY_B);

      tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
      tokenB = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_B));

      await tokenA.setManager(await manager.getAddress());
      await tokenB.setManager(await manager.getAddress());

      await manager.registerProject(PROJECT_A);
      await manager.registerProject(PROJECT_B);

      await tokenA.mint(user1.address, ethers.parseEther("1000"));
      await tokenB.mint(user1.address, ethers.parseEther("500"));
    });

    it("should deposit PT and receive 1:1 CIT", async function () {
      const depositAmt = ethers.parseEther("100");
      await tokenA.connect(user1).approve(await pool.getAddress(), depositAmt);
      await pool.connect(user1).deposit(await tokenA.getAddress(), depositAmt);
      expect(await citToken.balanceOf(user1.address)).to.equal(depositAmt);
    });

    it("should deposit from different projects and get 1:1 CIT each", async function () {
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await tokenB.connect(user1).approve(await pool.getAddress(), ethers.parseEther("50"));
      await pool.connect(user1).deposit(await tokenB.getAddress(), ethers.parseEther("50"));

      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("150"));
    });

    it("should withdraw proportional PT when burning CIT", async function () {
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      const citBal = await citToken.balanceOf(user1.address);
      await pool.connect(user1).withdraw(citBal);

      expect(await tokenA.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
      expect(await citToken.balanceOf(user1.address)).to.equal(0);
    });

    it("should reject deposit of unregistered token", async function () {
      await expect(
        pool.connect(user1).deposit(user1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Token not registered");
    });

    it("should reject deposit with zero amount", async function () {
      await expect(
        pool.connect(user1).deposit(await tokenA.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject withdraw with zero amount", async function () {
      await expect(
        pool.connect(user1).withdraw(0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should handle proportional withdraw with two project tokens", async function () {
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("600"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("600"));
      await tokenB.connect(user1).approve(await pool.getAddress(), ethers.parseEther("400"));
      await pool.connect(user1).deposit(await tokenB.getAddress(), ethers.parseEther("400"));
      await pool.connect(user1).withdraw(ethers.parseEther("500"));
      expect(await tokenA.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
      expect(await tokenB.balanceOf(user1.address)).to.equal(ethers.parseEther("300"));
      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
    });
  });

  describe("Partial Maturity", function () {
    let tokenA: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A);
    });

    it("should burn 10% PT from wallet and mint VCC", async function () {
      const amount = ethers.parseEther("500");
      await tokenA.mint(owner.address, amount);

      await manager.partialMature(PROJECT_A, 10);

      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("450"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("50"));
    });

    it("should burn PT from BOTH wallet and pool during partial maturity", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("300"));
      await tokenA.mint(user1.address, ethers.parseEther("200"));

      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("200"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("200"));

      await manager.partialMature(PROJECT_A, 10);

      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("270"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("30"));

      const poolPtBalance = await tokenA.balanceOf(await pool.getAddress());
      expect(poolPtBalance).to.equal(ethers.parseEther("180"));

      expect(await pool.vccInPool()).to.equal(ethers.parseEther("20"));
    });

    it("should support multi-round maturity (10% then 20% then 30%)", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("1000"));

      await manager.partialMature(PROJECT_A, 10);
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("900"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));

      await manager.partialMature(PROJECT_A, 20);
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("720"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("280"));

      await manager.partialMature(PROJECT_A, 30);
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("504"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("496"));
    });

    it("should revert partial maturity with invalid percent", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("100"));
      await expect(manager.partialMature(PROJECT_A, 0)).to.be.revertedWith("Percent must be 1-100");
      await expect(manager.partialMature(PROJECT_A, 101)).to.be.revertedWith("Percent must be 1-100");
    });

    it("should handle 100% maturity — burns all PT", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("1000"));
      await manager.partialMature(PROJECT_A, 100);
      expect(await tokenA.balanceOf(owner.address)).to.equal(0);
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("1000"));
    });

    it("should verify PT burned equals VCC minted (conservation law)", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("777"));
      const ptBefore = await tokenA.balanceOf(owner.address);
      await manager.partialMature(PROJECT_A, 33);
      const ptAfter = await tokenA.balanceOf(owner.address);
      const vccMinted = await vccToken.balanceOf(owner.address);
      expect(ptBefore - ptAfter).to.equal(vccMinted);
    });

    it("should handle integer rounding in partial maturity", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("999"));
      await manager.partialMature(PROJECT_A, 50);
      const ptRemaining = await tokenA.balanceOf(owner.address);
      const vccMinted = await vccToken.balanceOf(owner.address);
      expect(vccMinted).to.equal(ethers.parseEther("499"));
      expect(ptRemaining).to.equal(ethers.parseEther("500"));
      expect(ptRemaining + vccMinted).to.equal(ethers.parseEther("999"));
    });

    it("should revert maturity on unregistered project", async function () {
      await expect(
        manager.partialMature("nonexistent-project", 50)
      ).to.be.revertedWith("Project not registered");
    });

    it("should revert maturity when nothing to mature (zero balances)", async function () {
      await expect(
        manager.partialMature(PROJECT_A, 50)
      ).to.be.revertedWith("Nothing to mature");
    });
  });

  describe("TRUE FCFS - claimVCC", function () {
    let tokenA: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A);
    });

    it("should allow claiming VCC 1:1 from pool (FCFS)", async function () {
      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await manager.partialMature(PROJECT_A, 50);

      await pool.connect(user1).claimVCC(ethers.parseEther("50"));
      expect(await vccToken.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
    });

    it("should cap claim at available VCC (burns only matching CIT)", async function () {
      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await manager.partialMature(PROJECT_A, 10);
      // Pool now has 10 VCC, user has 100 CIT

      await pool.connect(user1).claimVCC(ethers.parseEther("50"));
      // Should only get 10 VCC and only burn 10 CIT
      expect(await vccToken.balanceOf(user1.address)).to.equal(ethers.parseEther("10"));
      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("90"));
    });

    it("should reject claim when pool has zero VCC", async function () {
      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await expect(
        pool.connect(user1).claimVCC(ethers.parseEther("10"))
      ).to.be.revertedWith("No VCC in pool");
    });

    it("should handle FCFS across multiple users", async function () {
      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.mint(user2.address, ethers.parseEther("100"));

      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await tokenA.connect(user2).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user2).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await manager.partialMature(PROJECT_A, 10);
      // Pool has 20 VCC (10% of 200 deposited)

      await pool.connect(user1).claimVCC(ethers.parseEther("15"));
      expect(await vccToken.balanceOf(user1.address)).to.equal(ethers.parseEther("15"));

      // User2 tries to claim 15 but only 5 remain
      await pool.connect(user2).claimVCC(ethers.parseEther("15"));
      expect(await vccToken.balanceOf(user2.address)).to.equal(ethers.parseEther("5"));
      expect(await citToken.balanceOf(user2.address)).to.equal(ethers.parseEther("95"));
    });

    it("should reject claim with zero amount", async function () {
      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));
      await manager.partialMature(PROJECT_A, 50);
      await expect(
        pool.connect(user1).claimVCC(0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Atomic Offset with NFT Certificate", function () {
    it("should burn VCC and mint NFT in single transaction", async function () {
      const amount = ethers.parseEther("50");
      await manager.mintVcc(owner.address, amount);

      await manager.offset(
        owner.address,
        amount,
        "project-alpha",
        "https://example.com/cert/1"
      );

      expect(await vccToken.balanceOf(owner.address)).to.equal(0);
      expect(await certificate.balanceOf(owner.address)).to.equal(1);

      const cert = await certificate.certificates(1);
      expect(cert.amount).to.equal(amount);
      expect(cert.projectId).to.equal("project-alpha");
      expect(cert.retiree).to.equal(owner.address);
    });

    it("should fail offset with zero amount", async function () {
      await expect(
        manager.offset(owner.address, 0, "p", "uri")
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should fail offset when holder has insufficient VCC", async function () {
      await expect(
        manager.offset(owner.address, ethers.parseEther("100"), "p", "uri")
      ).to.be.reverted;
    });

    it("should mint sequential NFT IDs for multiple offsets", async function () {
      await manager.mintVcc(owner.address, ethers.parseEther("100"));

      await manager.offset(owner.address, ethers.parseEther("30"), "p1", "uri1");
      await manager.offset(owner.address, ethers.parseEther("40"), "p2", "uri2");

      expect(await certificate.balanceOf(owner.address)).to.equal(2);

      const cert1 = await certificate.certificates(1);
      const cert2 = await certificate.certificates(2);
      expect(cert1.amount).to.equal(ethers.parseEther("30"));
      expect(cert2.amount).to.equal(ethers.parseEther("40"));
      expect(cert1.projectId).to.equal("p1");
      expect(cert2.projectId).to.equal("p2");
    });

    it("should reject offset by non-owner", async function () {
      await manager.mintVcc(user1.address, ethers.parseEther("50"));
      await expect(
        manager.connect(user1).offset(user1.address, ethers.parseEther("50"), "p", "uri")
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
  });

  describe("Full Lifecycle", function () {
    it("Buy → Deposit → Mature → Claim → Offset → NFT", async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA", MAX_SUPPLY_A);
      const tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A);

      // 1. Buy: Mint PT to company wallet
      await tokenA.mint(owner.address, ethers.parseEther("500"));

      // 2. "Sell" some to user1 (transfer in custodial model)
      await tokenA.transfer(user1.address, ethers.parseEther("200"));

      // 3. User1 deposits to pool
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("200"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("200"));
      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));

      // 4. Admin does partial maturity (50%)
      // Wallet has 300 PT, Pool has 200 PT
      await manager.partialMature(PROJECT_A, 50);
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("150"));
      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("150"));
      expect(await pool.vccInPool()).to.equal(ethers.parseEther("100"));

      // 5. User1 claims VCC from pool
      await pool.connect(user1).claimVCC(ethers.parseEther("100"));
      expect(await vccToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await citToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));

      // 6. Admin offsets VCC for user1 (atomic: burn VCC + mint NFT)
      // First, user1 needs to have VCC at the company wallet (custodial model)
      // In reality the backend calls this with the company wallet address
      await manager.offset(
        owner.address,
        ethers.parseEther("50"),
        PROJECT_A,
        "https://example.com/cert/alpha"
      );

      expect(await vccToken.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));
      expect(await certificate.balanceOf(owner.address)).to.equal(1);

      const cert = await certificate.certificates(1);
      expect(cert.amount).to.equal(ethers.parseEther("50"));
      expect(cert.projectId).to.equal(PROJECT_A);
    });
  });

  describe("Access Control", function () {
    it("should reject factory createToken by non-owner", async function () {
      await expect(
        factory.connect(user1).createToken("proj", "name", "SYM", ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("should reject registerProject by non-owner", async function () {
      await factory.createToken(PROJECT_A, "Alpha", "A", MAX_SUPPLY_A);
      await expect(
        manager.connect(user1).registerProject(PROJECT_A)
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });

    it("should reject partialMature by non-owner", async function () {
      await factory.createToken(PROJECT_A, "Alpha", "A", MAX_SUPPLY_A);
      const tokenA = await ethers.getContractAt("ProjectToken", await factory.getToken(PROJECT_A));
      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A);
      await tokenA.mint(owner.address, ethers.parseEther("100"));
      await expect(
        manager.connect(user1).partialMature(PROJECT_A, 50)
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });

    it("should reject SECToken mint by non-pool address", async function () {
      await expect(
        citToken.connect(user1).mint(user1.address, ethers.parseEther("100"))
      ).to.be.revertedWith("Only CreditPool");
    });
  });
});
