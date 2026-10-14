package com.acme.board;

public interface CachedCardStore extends Comparable<CachedCardStore>, CardStore {
  void evict();
}
