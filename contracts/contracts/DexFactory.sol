//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
pragma abicoder v2;

import "./DexPair.sol";

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

contract DexFactory {
  mapping(address => mapping(address => address)) public getPair;

  event PairCreated(address indexed token1, address indexed token2, address pair);

  function createPair(address tokenA, address tokenB)
    public
    returns (address pair)
  {
    require(tokenA != tokenB, "IDENTICAL ADDRESS");

    (address token0, address token1) = tokenA < tokenB
      ? (tokenA, tokenB)
      : (tokenB, tokenA);

    require(token0 != address(0), "ZERO ADDRESS");

    require(getPair[token0][token1] == address(0), "PAIR EXISTS");

    bytes memory bytecode = type(DexPair).creationCode;
    bytes32 salt = keccak256(abi.encodePacked(token0, token1));

    assembly {
      pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
    }

    DexPair(pair).initialize(token0, token1);
    getPair[token0][token1] = pair;
    getPair[token1][token0] = pair;

    emit PairCreated(token0, token1, pair);
  }
}
