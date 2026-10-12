package com.acme.jobs;

public final class Runner {
    public interface Callback {
        void done(Kind kind);

        enum Kind {
            SUCCESS,
            FAILURE
        }
    }

    public static class Limits {
        static final int LIMIT = 3;
    }

    public void run(Callback callback) {
        class Attempt {
            int number;
        }
        Attempt attempt = new Attempt();
        attempt.number = 1;
        callback.done(attempt.number <= Limits.LIMIT ? Callback.Kind.SUCCESS : Callback.Kind.FAILURE);
    }
}
