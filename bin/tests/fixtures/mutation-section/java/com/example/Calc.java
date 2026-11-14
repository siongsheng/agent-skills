package com.example;

class Calc {
  int pick(int a, int b) {
    int n = a > b ? a : b; n++;
    return n;
  }
  static class Inner { void log() {
    System.out.println("x");
  } }
}
