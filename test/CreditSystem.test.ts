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
} from "../typechain-types";

describe("Carbon Credit Token System", function () {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let factory: ProjectTokenFactory;
  let secToken: SECToken;
  let accToken: ActualCreditToken;
  let pool: CreditPool;
  let manager: CreditManager;

  const PROJECT_A = "project-alpha";
  const PROJECT_B = "project-beta";
  const WEIGHT_1X = ethers.parseEther("1");   // 1:1 weight
  const WEIGHT_2X = ethers.parseEther("2");   // 2:1 weight

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const AccFactory = await ethers.getContractFactory("ActualCreditToken");
    accToken = await AccFactory.deploy();

    const SecFactory = await ethers.getContractFactory("SECToken");
    secToken = await SecFactory.deploy();

    const PoolFactory = await ethers.getContractFactory("CreditPool");
    pool = await PoolFactory.deploy(await secToken.getAddress(), await accToken.getAddress());

    await secToken.setCreditPool(await pool.getAddress());

    const FactoryFactory = await ethers.getContractFactory("ProjectTokenFactory");
    factory = await FactoryFactory.deploy();

    const ManagerFactory = await ethers.getContractFactory("CreditManager");
    manager = await ManagerFactory.deploy(
      await factory.getAddress(),
      await pool.getAddress(),
      await accToken.getAddress()
    );

    await pool.transferOwnership(await manager.getAddress());

    await accToken.transferOwnership(await manager.getAddress());
  });

  describe("ProjectTokenFactory", function () {
    it("should deploy a new project token", async function () {
      const tx = await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      const receipt = await tx.wait();
      const addr = await factory.getToken(PROJECT_A);
      expect(addr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.totalProjects()).to.equal(1);
    });

    it("should reject duplicate project IDs", async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      await expect(
        factory.createToken(PROJECT_A, "Alpha Carbon 2", "ALPHA2")
      ).to.be.revertedWith("Token already exists for project");
    });
  });

  describe("Minting on Purchase", function () {
    let tokenA: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      const addr = await factory.getToken(PROJECT_A);
      tokenA = await ethers.getContractAt("ProjectToken", addr);
    });

    it("should mint RTP tokens to company wallet on purchase", async function () {
      const amount = ethers.parseEther("100");
      await tokenA.mint(owner.address, amount);
      expect(await tokenA.balanceOf(owner.address)).to.equal(amount);
    });

    it("should only allow owner to mint", async function () {
      await expect(
        tokenA.connect(user1).mint(user1.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(tokenA, "OwnableUnauthorizedAccount");
    });
  });

  describe("CreditPool -- Deposit & Withdraw", function () {
    let tokenA: ProjectToken;
    let tokenB: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      await factory.createToken(PROJECT_B, "Beta Carbon", "BETA");

      const addrA = await factory.getToken(PROJECT_A);
      const addrB = await factory.getToken(PROJECT_B);
      tokenA = await ethers.getContractAt("ProjectToken", addrA);
      tokenB = await ethers.getContractAt("ProjectToken", addrB);

      await tokenA.setManager(await manager.getAddress());
      await tokenB.setManager(await manager.getAddress());

      await manager.registerProject(PROJECT_A, WEIGHT_1X);
      await manager.registerProject(PROJECT_B, WEIGHT_2X);

      await tokenA.mint(user1.address, ethers.parseEther("1000"));
      await tokenB.mint(user1.address, ethers.parseEther("500"));
    });

    it("should deposit project tokens and receive weighted SEC", async function () {
      const depositAmt = ethers.parseEther("100");
      await tokenA.connect(user1).approve(await pool.getAddress(), depositAmt);
      await pool.connect(user1).deposit(await tokenA.getAddress(), depositAmt);

      // Weight 1x -> 100 SEC
      expect(await secToken.balanceOf(user1.address)).to.equal(depositAmt);
    });

    it("should apply weight 2x for project B", async function () {
      const depositAmt = ethers.parseEther("100");
      await tokenB.connect(user1).approve(await pool.getAddress(), depositAmt);
      await pool.connect(user1).deposit(await tokenB.getAddress(), depositAmt);

      // Weight 2x -> 200 SEC for 100 tokens
      expect(await secToken.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
    });

    it("should withdraw proportional tokens when burning SEC", async function () {
      const depositAmt = ethers.parseEther("100");

      await tokenA.connect(user1).approve(await pool.getAddress(), depositAmt);
      await pool.connect(user1).deposit(await tokenA.getAddress(), depositAmt);

      const secBal = await secToken.balanceOf(user1.address);
      await pool.connect(user1).withdraw(secBal);

      expect(await tokenA.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
      expect(await secToken.balanceOf(user1.address)).to.equal(0);
    });

    it("should reject deposit of unregistered token", async function () {
      await expect(
        pool.connect(user1).deposit(user1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Token not registered");
    });
  });

  describe("Maturity & Airdrop", function () {
    let tokenA: ProjectToken;

    beforeEach(async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      const addr = await factory.getToken(PROJECT_A);
      tokenA = await ethers.getContractAt("ProjectToken", addr);
      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A, WEIGHT_1X);
    });

    it("should burn RTP and mint ACC 1:1 on maturity (company wallet)", async function () {
      const amount = ethers.parseEther("500");
      await tokenA.mint(owner.address, amount);

      await tokenA.approve(await tokenA.getAddress(), amount);

      await manager.mature(PROJECT_A);

      expect(await tokenA.balanceOf(owner.address)).to.equal(0);
      expect(await accToken.balanceOf(owner.address)).to.equal(amount);
    });

    it("should reject double maturity", async function () {
      await tokenA.mint(owner.address, ethers.parseEther("100"));
      await manager.mature(PROJECT_A);
      await expect(manager.mature(PROJECT_A)).to.be.revertedWith("Already matured");
    });

    it("should allocate ACC to pool for tokens held there", async function () {
      const mintAmt = ethers.parseEther("200");
      await tokenA.mint(owner.address, ethers.parseEther("300"));
      await tokenA.mint(user1.address, mintAmt);

      await tokenA.connect(user1).approve(await pool.getAddress(), mintAmt);
      await pool.connect(user1).deposit(await tokenA.getAddress(), mintAmt);

      await manager.mature(PROJECT_A);

      expect(await pool.accAllocatedToPool()).to.equal(mintAmt);
    });
  });

  describe("Offset / Retirement", function () {
    it("should burn ACC tokens on offset", async function () {
      const amount = ethers.parseEther("50");
      await manager.mintAcc(owner.address, amount);

      await accToken.approve(await manager.getAddress(), amount);

      await manager.offset(owner.address, amount);
      expect(await accToken.balanceOf(owner.address)).to.equal(0);
    });
  });

  describe("SEC Holder Claims ACC After Maturity", function () {
    it("should allow SEC holders to claim proportional ACC", async function () {
      await factory.createToken(PROJECT_A, "Alpha Carbon", "ALPHA");
      const addr = await factory.getToken(PROJECT_A);
      const tokenA = await ethers.getContractAt("ProjectToken", addr);

      await tokenA.setManager(await manager.getAddress());
      await manager.registerProject(PROJECT_A, WEIGHT_1X);

      await tokenA.mint(user1.address, ethers.parseEther("100"));
      await tokenA.connect(user1).approve(await pool.getAddress(), ethers.parseEther("100"));
      await pool.connect(user1).deposit(await tokenA.getAddress(), ethers.parseEther("100"));

      await manager.mature(PROJECT_A);

      const secBal = await secToken.balanceOf(user1.address);
      expect(secBal).to.equal(ethers.parseEther("100"));

      await pool.connect(user1).claimActualCredits(secBal);

      expect(await accToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await secToken.balanceOf(user1.address)).to.equal(0);
    });
  });
});
