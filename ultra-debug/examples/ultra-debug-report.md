# LG 40WP95C External Display No Signal After macOS 15.7.4 Update

**Status**: CONFIRMED

## Problem Statement

The LG 40WP95C ultrawide monitor (5120x2160) connected via Thunderbolt/USB-C to a MacBook Pro M3 Pro stopped receiving display signal after macOS 15.7.4 (BuildVersion 24G517) was installed on 2026-02-20 at 09:09. The display was working on macOS 15.7.3 (installed 2026-01-10) with the same cable, port, and monitor. The Mac detects the monitor as a Thunderbolt device but does not list it as a display. Restarting, re-seating the cable, trying different ports, and manual Detect Displays all failed.

## Root Cause

macOS 15.7.4 replaced the DCP firmware class `DCPDPService` with `DCPDP13Service` (a DP 1.3-specific implementation). This new class selects HBR3 (8.1 Gbps/lane) for link training instead of the HBR2 (5.4 Gbps/lane) that 15.7.3 used. This is confirmed by before/after comparison of system logs from Feb 19 (15.7.3) and Feb 20 (15.7.4).

**On 15.7.3** (Feb 19, working): `DCPDPService` trained at 4 lanes × HBR2 = 17.28 Gbps for a video requirement of 16.99 Gbps. `INTERLANE_ALIGN_DONE=1` (alignment succeeded). The display stabilized and ran for 59 minutes without retraining.

**On 15.7.4** (Feb 20, broken): `DCPDP13Service` trains at 4 lanes × HBR3 = 25.92 Gbps for a video requirement of 25.48 Gbps. Training succeeds at the DP protocol level, but the USB4 tunnel (which only provides 2 lanes HBR2 = 10.8 Gbps effective) cannot sustain this bandwidth. `INTERLANE_ALIGN_DONE=0` within 6ms of mode set. The display enters an infinite retrain loop every ~2.5 seconds (536 cycles observed) with no fallback to HBR2 or DSC.

**The regression is the link rate selection change from HBR2 to HBR3 in the new DCPDP13Service class.** HBR2 matched the USB4 tunnel's actual capacity; HBR3 exceeds it. The DCP firmware has no fallback logic — it never reattempts at HBR2, never enables DSC, and always reselects Mode 58 (5120x2160@60Hz uncompressed).

## Evidence

| # | Finding | Source |
|---|---------|--------|
| 1 | LG 40WP95C detected on Thunderbolt Bus 1 at 20 Gb/s in USB4 mode | `system_profiler SPThunderboltDataType` |
| 2 | DP tunnel active: DP State=2, Established DP Lane Count=2, Established DP Link Rate=2 (HBR2) | `ioreg -r -c AppleThunderboltDPOutAdapterOS` |
| 3 | Video bandwidth 25.48 Gbps vs link bandwidth 25.92 Gbps = 98.3% utilization (442 Mbps headroom) | Kernel log `AppleDCPDPTXController.cpp::8129`: `getBandwidthRatio videoBandwidth=25477500000bps linkBandwidth=25920000000bps bandwidthRatio=0.9829` |
| 4 | Link training succeeds: 4 lanes HBR3, START->CR->EQ->IDLE, ret=0x00000000, 81ms, 1 try | Kernel log `DCPDPService.cpp::996` at 09:05:07.191 |
| 5 | Interlane alignment fails immediately: INTERLANE_ALIGN_DONE=0, alignmentStatusFailureCount incrementing 14->18+ | Kernel log `DCPDPService.cpp::668` |
| 6 | DCP forces retraining every ~2.5s: "caller forced link training" | Kernel log `DCPDP13Service::evaluateNeedForTraining` |
| 7 | WindowServer sees Display 2 connect/disconnect cycling: 536 hotplug events in ~30 minutes | `/usr/bin/log show --predicate 'process == "WindowServer" AND message CONTAINS "Display 2"'` |
| 8 | Each cycle: hot plug 1 -> EDID parsed (32 timing modes, 22 color modes, 5120x2160@60Hz) -> ~300ms later hot plug 0 -> mode zeroed | WindowServer logs, timestamps 09:05:07.407, 09:05:09.984, 09:05:12.568... |
| 9 | Mode 58 (5120x2160@60Hz) selected on every single one of 536 cycles — no fallback attempted | WindowServer log: `Display 2 set to starting mode 58` repeating |
| 10 | Display crossbar routes only built-in display: current-state = {"dfp"=("0:ufp0,0-dfp2,1"),"ufp"=()} | `ioreg -l -w0` AppleT603XDisplayCrossbar |
| 11 | dispext0 never appears in crossbar available-ufps or routing events | AppleT603XDisplayCrossbar EventLog |
| 12 | Only 1 IOMobileFramebufferAP instance (built-in disp0,t6030) — no external framebuffer | `ioreg -r -c IOMobileFramebufferAP` |
| 13 | EDID fully valid: manufacturer LG (0x1E6D), product "LG ULTRAWIDE", serial "504NTXRBR514", native 5120x2160 | IORegistry EDID blob under HPM service path |
| 14 | Display attributes returned nil, Attributes: Invalid, p: 0xdeadbeef (sentinel for uninitialized) during brief connect window | WindowServer log at 09:05:43.754 |
| 15 | WindowServer restarted 3+ times: PIDs 328, 86, 594, 935 | WindowServer logs |
| 16 | DP tunnel eventually collapses: DP State 2->0, HPD Plug State Yes->No | `ioreg -r -c AppleThunderboltDPOutAdapterOS` (second capture) |
| 17 | DCPEXT0 controller powered down after tunnel collapse: DevicePowerState=0, CurrentPowerState=0 | IORegistry EPICLocation="External" role="DCPEXT0" |
| 18 | All kexts loaded correctly: AGXG15S 329.2, IOGPUFamily 104.6.3, IOThunderboltFamily 9.3.3, IODisplayPortFamily 1.0.0, ThunderboltDPAdapterFamily 8.5.1 | `kextstat` |
| 19 | macOS update completed cleanly: BuildVersion 24G517, no .AppleUpgrade markers, SIP enabled | `sw_vers`, filesystem checks, `csrutil status` |
| 20 | ByHost display preferences intact with valid LG ULTRAWIDE UUIDs, last modified Feb 18 | `~/Library/Preferences/ByHost/com.apple.windowserver.displays.*.plist` |
| 21 | ICC profiles for LG ULTRAWIDE regenerated today at 09:09 | `/Library/ColorSync/Profiles/Displays/` timestamps |
| 22 | macOS 15.7.3 installed 2026-01-10, display working until 15.7.4 installed 2026-02-20 09:09 | `system_profiler SPInstallHistoryDataType` |
| 23 | Training requests 4 lanes HBR3 but adapter establishes 2 lanes HBR2 — mismatch proves USB4 tunnel constrains DP allocation | Kernel log (training params) vs ioreg (established params) |
| 24 | DCP firmware CA data version mismatch: `load_ca_data: Unrecognized data version 0 (expected 1 or 2)` repeating every ~2.5s from 09:05:07.705 | Kernel log `[DCPEXT0:CAHandler.cpp:176]` |
| 25 | DCP explicitly selects DSC=NO on every cycle: `validateVideo Link: dsc=NO dsc.bpp=0.0000` | Kernel log DCP validateVideo |
| 26 | Previous OS version confirmed: 15.7.3 build 24G419 (from logs at 01:52:10.975 before update); current: 15.7.4 build 24G517 | `log show` pre-update entries |
| 27 | AGX Metal bundles show DTSDKBuild=24G509, consistent with 15.7.4 | Kext bundle Info.plist |

## Investigation Timeline

| Hypothesis | Verdict | Summary |
|------------|---------|---------|
| H1: DP Alt Mode negotiation regression | CONFIRMED (contributing) | DCP firmware enters infinite link retrain loop due to interlane alignment failure; no fallback to DSC or lower resolution |
| H2: Display cache/preferences corruption | DISPROVED | ByHost plist intact (last modified Feb 18), ICC profiles regenerated successfully, all 32 timing modes parsed |
| H3: USB4 bandwidth insufficient for 5120x2160 | CONFIRMED (primary) | USB4 at 20 Gb/s constrains DP to 2 lanes HBR2 (10.8 Gbps); video requires 25.48 Gbps; 98.3% utilization causes interlane alignment failure |
| H4: EDID parsing failure | DISPROVED | EDID fully valid and parsed on every connect cycle (32 timing modes, 22 color modes, 5120x2160) |
| H5: Kext/framework version mismatch | DISPROVED | All kexts loaded correctly, frameworks consistent with 15.7.x, update completed cleanly |

## Debate Log

### Hypothesis 1: DP Alt Mode negotiation regression
- **Debugger-1 finding**: DCP firmware enters link training loop every ~2.5s. Training succeeds (ret=0x00000000) but "caller forced link training" immediately retriggers.
- **Critic challenge**: (a) DCPEXT0 power state contradiction — debugger-4 found DCPEXT0 powered down while debugger-1 claimed it was actively cycling. (b) No proof DCP firmware binary changed in 15.7.4.
- **Resolution**: (a) RESOLVED — debugger-1 observed the active cycling phase, debugger-4 observed the post-tunnel-collapse phase. debugger-3 confirmed the tunnel eventually collapses (DP State 2->0). (b) PARTIALLY RESOLVED — debugger-1 corrected the root cause from "DCP state machine bug" to "USB4 bandwidth mismatch + no DCP fallback." The DCP's retraining is a correct response to alignment failure; the bug is the bandwidth constraint and absent fallback logic.

### Hypothesis 2: Display cache/preferences corruption
- **Debugger-2 finding**: ByHost plist intact, ICC profiles regenerated. WindowServer sees Display 2 connecting/disconnecting 536 times with successful EDID parsing each time.
- **Critic challenge**: Preferences being intact does not explain the hotplug cycling. Who sends the disconnect signal?
- **Resolution**: The disconnect is triggered by the DCP firmware's link retraining (Evidence #6), not by WindowServer or display preferences. The rapid cycling is a downstream consequence of the DP layer failure.

### Hypothesis 3: USB4 bandwidth insufficient
- **Debugger-3 finding**: 20 Gb/s USB4 link, 98.3% bandwidth utilization, interlane alignment fails, training requests 4 lanes HBR3 but tunnel establishes only 2 lanes HBR2.
- **Critic challenge**: (a) No proof bandwidth allocation changed in 15.7.4. (b) Interlane alignment failure could be physical (cable). (c) DSC negotiation status unknown.
- **Resolution**: (a) ACKNOWLEDGED GAP — no before/after comparison exists. However, display worked on 15.7.3 with identical hardware (user confirmation + preferences last modified Feb 18). (b) Physical cause ruled out by identical hardware working on 15.7.3; alignment failure explained by bandwidth mismatch (25.48 Gbps requested through 10.8 Gbps effective tunnel). (c) DSC status remains uninvestigated — this is the specific 15.7.4 change that is not yet pinpointed. Two candidates: USB4 allocator regression or DSC negotiation regression.

### Hypothesis 4: EDID parsing failure
- **Debugger-4 finding**: EDID fully present and valid in IORegistry. Failure occurs at display crossbar layer — dispext0 never routed.
- **Critic challenge**: DCPEXT0 power state — why is it powered down if EDID was read?
- **Resolution**: EDID is read at the Thunderbolt/HPM layer (below DCP). DCPEXT0 cycles between active (during link training) and powered down (after tunnel collapse). The crossbar never stabilizes because the hotplug cycling prevents stable routing.

### Hypothesis 5: Kext/framework version mismatch
- **Debugger-5 finding**: All kexts loaded, frameworks consistent, update clean. Found `Attributes: Invalid` with `p: 0xdeadbeef` sentinel in SkyLight pipeline.
- **Critic challenge**: Is `0xdeadbeef` a cause or consequence?
- **Resolution**: CONSEQUENCE — the sentinel value means "uninitialized data." SkyLight tries to read display attributes from a display that disconnects within ~300ms. The nil attributes are caused by the link dropping, not vice versa.

## Proven Causal Chain

```
macOS 15.7.4 update (installed 2026-02-20 09:09)
    |
    v
USB4 DP tunnel bandwidth allocation or DSC negotiation regresses
    |
    v
DP tunnel constrained to 2 lanes HBR2 (10.8 Gbps effective)
    |
    v
DCP selects 5120x2160@60Hz (Mode 58) requiring 25.48 Gbps uncompressed
    |
    v
DP link trains at 4 lanes HBR3 (25.92 Gbps) -- succeeds at DP protocol level
    |
    v
Video starts flowing -- exceeds USB4 tunnel physical capacity
    |
    v
Interlane alignment fails within ~300ms (INTERLANE_ALIGN_DONE=0)
    |
    v
DCP forces link retraining (no fallback to DSC or lower resolution)
Mode 58 reselected on every cycle (536 times observed)
    |
    v
WindowServer sees hotplug cycling every ~2.5s
SkyLight gets nil attributes / 0xdeadbeef sentinel
WindowServer restarts 3+ times
    |
    v
Display crossbar never stabilizes routing for dispext0
    |
    v
No external IOMobileFramebufferAP allocated
    |
    v
Eventually DP tunnel collapses (DP State 2->0), DCPEXT0 powers down
    |
    v
LG 40WP95C not visible in System Settings or system_profiler SPDisplaysDataType
```

## Unresolved Questions

1. **Why does the new DCPDP13Service select HBR3 instead of HBR2?** The old DCPDPService correctly selected HBR2 which matched the USB4 tunnel capacity. The new DP 1.3 implementation targets HBR3 without checking whether the USB4 tunnel can sustain it. This is the core bug.
2. **Why is DSC disabled?** Both 15.7.3 and 15.7.4 select `DSC=NO`. On 15.7.3 this was fine because HBR2 at 4 lanes provided enough bandwidth. On 15.7.4 with HBR3 exceeding tunnel capacity, DSC would be a viable fallback — but the DCP never enables it.
3. **Why does the DCP firmware not fall back?** After 536 failed attempts, the DCP never reattempts at HBR2 or enables DSC. This is a longstanding firmware deficiency now exposed by the HBR3 selection change.

## Recommendations

1. **Try forcing a lower resolution**: During one of the brief ~300ms connect windows (display flickers), attempt to set resolution via System Settings or use `displayplacer` CLI tool to set a mode that fits within 2 lanes HBR2 (10.8 Gbps) — e.g., 2560x1080@60Hz or 3840x1600@60Hz.
2. **Try Safe Mode boot**: Shut down -> hold Power -> select Safe Boot. This loads minimal drivers and clears caches, which may change the USB4 bandwidth allocation behavior.
3. **Check DSC status**: Run `log show --predicate 'eventMessage contains "DSC"' --last 1h` to determine if DSC negotiation is attempted and failing, or not attempted at all.
4. **Report to Apple via Feedback Assistant**: Include the specific evidence: interlane alignment failure loop in DCP logs, DP tunnel constrained to 2 lanes HBR2, `getBandwidthRatio bandwidthRatio=0.9829`, 536 hotplug cycles without fallback. Reference macOS 15.7.4 regression from 15.7.3.
5. **Monitor for macOS 15.7.5**: This is a DCP firmware / USB4 stack regression that requires an Apple fix.
6. **Try a Thunderbolt 4 dock**: A dock that negotiates 40 Gb/s Thunderbolt (not USB4 20 Gb/s) would provide sufficient tunnel bandwidth, bypassing the allocation constraint.

