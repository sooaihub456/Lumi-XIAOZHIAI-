# Concentus Android build hotfix

The Android preparation flow now runs Capacitor sync before adding native Maven dependencies. This keeps Concentus on the final Java compile classpath and fixes `package org.concentus does not exist` / `cannot find symbol OpusDecoder` build failures.
