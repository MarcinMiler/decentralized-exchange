//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./DexFactory.sol";
import "./library/DexLibrary.sol";
import "./library/TransferHelper.sol";
import "hardhat/console.sol";

interface IDexPair {
  function transferFrom(address from, address to, uint value) external returns (bool);

  function swap(uint amount0, uint amount1, address to) external;
}

contract DexRouter {
  address public immutable factory;

  constructor(address _factory) {
    factory = _factory;
  }
  
  function _addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired) private returns (uint amountA, uint amountB) {
    if (DexFactory(factory).getPair(tokenA, tokenB) == address(0)) {
      DexFactory(factory).createPair(tokenA, tokenB);
    }
    (uint reserveA, uint reserveB) = DexLibrary.getReserves(factory, tokenA, tokenB);

    if (reserveA == 0 && reserveB == 0) {
      (amountA, amountB) = (amountADesired, amountBDesired);
    } else {
      uint amountBOptimal = DexLibrary.quote(amountADesired, reserveA, reserveB);
      (amountA, amountB) = (amountADesired, amountBOptimal);
    }
  }

  function addLiquidity(
    address tokenA,
    address tokenB,
    uint amountADesired,
    uint amountBDesired,
    address to
  ) external returns (uint amountA, uint amountB, uint liquidity) {
    (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired);

    address pair = DexLibrary.pairFor(factory, tokenA, tokenB);

    TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
    TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);

    liquidity = DexPair(pair).mint(to);
  }

  function removeLiquidity(
    address tokenA,
    address tokenB,
    uint liquidity,
    address to
  ) public returns (uint amountA, uint amountB) {
    address pair = DexLibrary.pairFor(factory, tokenA, tokenB);

    IDexPair(pair).transferFrom(msg.sender, pair, liquidity);

    (uint amount0, uint amount1) = DexPair(pair).burn(to);
    (address token0,) = DexLibrary.sortTokens(tokenA, tokenB);
    (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
  }

  function swapExactTokensForTokens(
    uint amountIn,
    uint amountOutMin,
    address tokenA,
    address tokenB,
    address to
  ) external returns (uint amountOut) {
    (uint reserveIn, uint reserveOut) = DexLibrary.getReserves(factory, tokenA, tokenB);

    amountOut = DexLibrary.getAmountOut(amountIn, reserveIn, reserveOut);

    require(amountOut >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
    (address input,) = DexLibrary.sortTokens(tokenA, tokenB);
    (uint amount0Out, uint amount1Out) = input == tokenA ? (uint(0), amountOut) : (amountOut, uint(0));

    address pair = DexLibrary.pairFor(factory, tokenA, tokenB);
    TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountIn);

    IDexPair(pair).swap(amount0Out, amount1Out, to);
  }

  function swapTokensForExactTokens(
    uint amountOut,
    uint amountInMax,
    address tokenA,
    address tokenB,
    address to
  ) external returns (uint amountIn) {
    (uint reserveIn, uint reserveOut) = DexLibrary.getReserves(factory, tokenA, tokenB);

    amountIn = DexLibrary.getAmountIn(amountOut, reserveIn, reserveOut);

    require(amountIn <= amountInMax, "EXCESSIVE_INPUT_AMOUNT");
    (address input,) = DexLibrary.sortTokens(tokenA, tokenB);
    (uint amount0In, uint amount1In) = input == tokenA ? (uint(0), amountOut) : (amountOut, uint(0));

    address pair = DexLibrary.pairFor(factory, tokenA, tokenB);

    TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountIn);

    IDexPair(pair).swap(amount0In, amount1In, to);
  }

  function quote(uint amountA, uint reserveA, uint reserveB) public pure returns (uint amountB) {
    return DexLibrary.quote(amountA, reserveA, reserveB);
  }

  function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) public pure returns (uint amountOut) {
    return DexLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
  }

  function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) public pure returns (uint amountIn) {
    return DexLibrary.getAmountOut(amountOut, reserveIn, reserveOut);
  }
}