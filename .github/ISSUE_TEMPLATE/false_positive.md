---
name: False positive
about: A finding was reported that should not have been
title: '[False positive] '
labels: false-positive
assignees: ''
---

**Rule ID**
Which rule produced the false positive (e.g., ARD003)?

**Why it is a false positive**
Explain why the finding does not represent a real review risk. Facts over opinions: cite Apple/Expo documentation where possible.

**Reproduction**
Minimal repository or diff that triggers the finding. Fixtures are preferred.

**Expected behavior**
What the tool should report instead (including "nothing").

**Severity of impact**
Does this break CI for users (ERROR), create noise (WARNING/INFO), or something else?
