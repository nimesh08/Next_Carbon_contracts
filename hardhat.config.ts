import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";

dotenv.config();

const INFURA_API_URL = process.env.INFURA_API_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const PRIVATE_KEY_USER1 = process.env.PRIVATE_KEY_USER1 || "0x0000000000000000000000000000000000000000000000000000000000000002";
const PRIVATE_KEY_USER2 = process.env.PRIVATE_KEY_USER2 || "0x0000000000000000000000000000000000000000000000000000000000000003";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: INFURA_API_URL,
      accounts: [PRIVATE_KEY, PRIVATE_KEY_USER1, PRIVATE_KEY_USER2],
      chainId: 80002,
    },
    megaeth: {
      url: "https://carrot.megaeth.com/rpc",
      accounts: [PRIVATE_KEY, PRIVATE_KEY_USER1, PRIVATE_KEY_USER2],
      chainId: 6343,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== 'false',
    currency: 'USD',
    gasPrice: 30,
    noColors: false,
  },
};

export default config;
