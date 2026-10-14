package com.acme.board;

public class MemoryCardStore implements CachedCardStore {
  public void put(String card) {}
  public void evict() {}
  public int compareTo(CachedCardStore other) { return 0; }
}
