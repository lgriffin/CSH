package grain;

public final class Quota {
    private final int quota;
    private final long period;
    private int used;

    public Quota(int quota, long period) {
        this.quota = quota;
        this.period = period;
    }

    public boolean admit() {
        if (used >= quota) return false;
        used += 1;
        return true;
    }

    public long period() {
        return period;
    }
}
