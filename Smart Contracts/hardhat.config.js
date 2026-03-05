/**
 * Hardhat Configuration — Aether Smart Contracts
 *
 * Supports multi-chain deployment to Ethereum, Polygon, Arbitrum, Base, and Optimism.
 * RPC URLs and deployer keys are loaded from environment variables so that
 * no secrets are committed to source control.
 *
 * Install dependencies before use:
 *   npm install --save-dev @nomicfoundation/hardhat-toolbox
 */

require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  networks: {
    // Local development network (default)
    hardhat: {},

    // ── Mainnet chains ──────────────────────────────────────────────
    ethereum: {
      url: process.env.ETHEREUM_RPC || "https://eth.llamarpc.com",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 1,
    },
    polygon: {
      url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 137,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 42161,
    },
    base: {
      url: process.env.BASE_RPC || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 8453,
    },
    optimism: {
      url: process.env.OPTIMISM_RPC || "https://mainnet.optimism.io",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 10,
    },
  },

  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_KEY || "",
      polygon: process.env.POLYGONSCAN_KEY || "",
      arbitrumOne: process.env.ARBISCAN_KEY || "",
      base: process.env.BASESCAN_KEY || "",
      optimisticEthereum: process.env.OPTIMISM_ETHERSCAN_KEY || "",
    },
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
