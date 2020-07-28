const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
  mode: "production",
  target: "node",

  context: path.join(__dirname, ".."),

  entry: path.join(__dirname, "../src/main.ts"),

  externals: {
    "@nestjs/websockets/socket-module": "commonjs2 @nestjs/websockets/socket-module",
    "amqp-connection-manager": "commonjs2 amqp-connection-manager",
    "amqplib": "commonjs2 amqplib",
    "cache-manager": "commonjs2 cache-manager",
    "class-transformer": "commonjs2 class-transformer",
    "grpc": "commonjs2 grpc",
    "kafkajs": "commonjs2 kafkajs",
    "mqtt": "commonjs2 mqtt",
    "pg-native": "commonjs2 pg-native",
    "redis": "commonjs2 redis",
    "sqlite3": "commonjs2 sqlite3",
  },

  node: {
    __filename: false,
    __dirname: false,
  },

  resolve: {
    mainFields: ["main", "module"],
    extensions: [".js", ".wasm", ".ts", ".json"],
    symlinks: false,
  },

  output: {
    path: path.join(__dirname, "../dist"),
    filename: "bundle.js",
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/env"],
          },
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "../tsconfig.json"),
          },
        },
      },
      {
        test: /\.wasm$/,
        type: "javascript/auto",
        loaders: ["wasm-loader"],
      },
    ],
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, "../../../node_modules/@connext/pure-evm-wasm/pure-evm_bg.wasm"),
          to: path.join(__dirname, "../dist/pure-evm_bg.wasm"),
        },
      ],
    }),
  ],

  stats: { warnings: false },
};
