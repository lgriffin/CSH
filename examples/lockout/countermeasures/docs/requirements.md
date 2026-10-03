# Sign-in lockout requirements

| ID | Requirement |
| --- | --- |
| LCK-001 | IF a sign-in attempt fails when the account already has 2 failed attempts, THEN THE SIGN-IN SERVICE SHALL lock the account for 15 minutes. |
| LCK-002 | WHILE the account is locked, WHEN the user signs in, THE SIGN-IN SERVICE SHALL refuse the sign-in. |
| LCK-003 | WHILE the account is not locked, WHEN the user signs in with the correct password, THE SIGN-IN SERVICE SHALL accept the sign-in and reset the failed-attempt count. |
| LCK-004 | THE SIGN-IN SERVICE SHALL email the account holder when the account is locked. |
| LCK-005 | WHERE two-factor sign-in is enabled, THE SIGN-IN SERVICE SHALL NOT count a failed second factor as a failed password attempt. |
