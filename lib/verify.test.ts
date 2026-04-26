/**
 * lib/verify.test.ts
 * ---------------------------------------------------------------------------
 * Unit tests for the rewards rules engine. Run with:
 *   npm test
 * (which invokes `tsx --test lib/verify.test.ts`)
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  verify,
  parseRewardsConfig,
  InvalidRuleError,
  type RewardRule,
} from "./verify";
import type { OwnedMoment } from "./topshot";

// -----------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------

function m(partial: Partial<OwnedMoment>): OwnedMoment {
  return {
    source: "0xabc",
    momentID: "1",
    playID: 1,
    setID: 1,
    serialNumber: 1,
    setName: "Test Set",
    series: 1,
    playMetadata: null,
    thumbnail: null,
    isLocked: false,
    lockExpiry: null,
    ...partial,
  };
}

const moments: OwnedMoment[] = [
  m({ momentID: "100", playID: 1, setID: 10, series: 5, playMetadata: { Tier: "COMMON" } }),
  m({ momentID: "101", playID: 2, setID: 10, series: 5, playMetadata: { Tier: "RARE" } }),
  m({ momentID: "102", playID: 3, setID: 10, series: 5, playMetadata: { Tier: "COMMON" } }),
  m({ momentID: "200", playID: 7, setID: 20, series: 6, playMetadata: { Tier: "LEGENDARY" } }),
  // duplicate play in set 10 (should not double-count for set_completion)
  m({ momentID: "103", playID: 1, setID: 10, series: 5, serialNumber: 2, playMetadata: { Tier: "COMMON" } }),
];

// -----------------------------------------------------------------
// specific_moments
// -----------------------------------------------------------------

describe("verify() — specific_moments", () => {
  it("earns the reward when ALL required momentIds are owned", () => {
    const rules: RewardRule[] = [
      { id: "r1", type: "specific_moments", momentIds: ["100", "101"], reward: "R1" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, true);
    assert.deepEqual(res.earnedRewards, ["R1"]);
    assert.equal(res.evaluations[0].progress, 1);
  });

  it("reports partial progress when some are missing", () => {
    const rules: RewardRule[] = [
      { id: "r1", type: "specific_moments", momentIds: ["100", "999"], reward: "R1" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, false);
    assert.equal(res.evaluations[0].matchedCount, 1);
    assert.equal(res.evaluations[0].progress, 0.5);
  });

  it("accepts number ids and compares to string ids", () => {
    const rules: RewardRule[] = [
      { id: "r1", type: "specific_moments", momentIds: [100, 101], reward: "R1" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, true);
  });
});

// -----------------------------------------------------------------
// set_completion
// -----------------------------------------------------------------

describe("verify() — set_completion", () => {
  it("earns when distinct-play ownership meets minPercent", () => {
    // Set 10: plays 1,2,3 owned (distinct, duplicate of 1 not double-counted).
    // 3 of 5 plays = 60%.
    const rules: RewardRule[] = [
      { id: "sc", type: "set_completion", setId: 10, totalPlays: 5, minPercent: 60, reward: "Half" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, true);
    assert.equal(res.evaluations[0].matchedCount, 3);
  });

  it("fails when below minPercent", () => {
    const rules: RewardRule[] = [
      { id: "sc", type: "set_completion", setId: 10, totalPlays: 5, minPercent: 80, reward: "Most" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, false);
    assert.ok(res.evaluations[0].progress < 1);
  });

  it("defaults minPercent to 100%", () => {
    const rules: RewardRule[] = [
      { id: "sc", type: "set_completion", setId: 10, totalPlays: 3, reward: "Full" },
    ];
    const res = verify(moments, rules);
    // 3 of 3 distinct plays → 100% → earned.
    assert.equal(res.evaluations[0].earned, true);
  });

  it("ignores moments from other sets", () => {
    const rules: RewardRule[] = [
      { id: "sc", type: "set_completion", setId: 20, totalPlays: 10, minPercent: 10, reward: "Tenth" },
    ];
    const res = verify(moments, rules);
    // 1 of 10 = 10% → meets threshold.
    assert.equal(res.evaluations[0].earned, true);
    assert.equal(res.evaluations[0].matchedCount, 1);
  });
});

// -----------------------------------------------------------------
// quantity
// -----------------------------------------------------------------

describe("verify() — quantity", () => {
  it("counts all moments when no filter is set", () => {
    const rules: RewardRule[] = [
      { id: "q", type: "quantity", minCount: 5, reward: "Five" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, true);
    assert.equal(res.evaluations[0].matchedCount, 5);
  });

  it("filters by setId (AND semantics with other filters)", () => {
    const rules: RewardRule[] = [
      { id: "q", type: "quantity", minCount: 4, setId: 10, reward: "Set10Four" },
    ];
    const res = verify(moments, rules);
    // Set 10 has 4 moments (100, 101, 102, 103).
    assert.equal(res.evaluations[0].earned, true);
  });

  it("filters by series (loose string/number compare)", () => {
    const rules: RewardRule[] = [
      { id: "q", type: "quantity", minCount: 4, series: "5", reward: "S5" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].matchedCount, 4);
  });

  it("filters by tier from playMetadata", () => {
    const rules: RewardRule[] = [
      { id: "q", type: "quantity", minCount: 1, tier: "LEGENDARY", reward: "Legend" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, true);
    assert.equal(res.evaluations[0].matchedCount, 1);
  });

  it("fails when filtered count is below minCount", () => {
    const rules: RewardRule[] = [
      { id: "q", type: "quantity", minCount: 10, tier: "RARE", reward: "Rare10" },
    ];
    const res = verify(moments, rules);
    assert.equal(res.evaluations[0].earned, false);
    assert.equal(res.evaluations[0].matchedCount, 1);
    assert.equal(res.evaluations[0].progress, 0.1);
  });
});

// -----------------------------------------------------------------
// locking gate (requireLocked / requireLockedUntil)
// -----------------------------------------------------------------

describe("verify() — locking gate", () => {
  const lockedMoments: OwnedMoment[] = [
    m({ momentID: "1", playID: 1, setID: 10, isLocked: true,  lockExpiry: 2_000_000_000 }),
    m({ momentID: "2", playID: 2, setID: 10, isLocked: false, lockExpiry: null }),
    m({ momentID: "3", playID: 3, setID: 10, isLocked: true,  lockExpiry: 1_000 }), // expires soon
    m({ momentID: "4", playID: 4, setID: 10, isLocked: true,  lockExpiry: null }),  // perpetual
  ];

  it("quantity: requireLocked only counts locked moments", () => {
    const res = verify(lockedMoments, [
      { id: "q", type: "quantity", minCount: 3, setId: 10, requireLocked: true, reward: "R" },
    ]);
    assert.equal(res.evaluations[0].matchedCount, 3);
    assert.equal(res.evaluations[0].earned, true);
  });

  it("quantity: requireLockedUntil filters out expiring-too-soon locks", () => {
    const res = verify(lockedMoments, [
      {
        id: "q",
        type: "quantity",
        minCount: 1,
        setId: 10,
        requireLocked: true,
        requireLockedUntil: 1_500_000_000,
        reward: "R",
      },
    ]);
    // id 1 (2e9) and id 4 (perpetual) qualify; id 3 expires too soon.
    assert.equal(res.evaluations[0].matchedCount, 2);
  });

  it("specific_moments: ignores unlocked copies when requireLocked", () => {
    const res = verify(lockedMoments, [
      {
        id: "r",
        type: "specific_moments",
        momentIds: ["1", "2"],
        requireLocked: true,
        reward: "R",
      },
    ]);
    // id 1 locked; id 2 not locked → not earned, 1 of 2 matched.
    assert.equal(res.evaluations[0].earned, false);
    assert.equal(res.evaluations[0].matchedCount, 1);
  });

  it("set_completion: only locked distinct plays count", () => {
    const res = verify(lockedMoments, [
      {
        id: "sc",
        type: "set_completion",
        setId: 10,
        totalPlays: 4,
        minPercent: 75,
        requireLocked: true,
        reward: "R",
      },
    ]);
    // Locked plays in set 10: 1, 3, 4 → 3 distinct → 75%.
    assert.equal(res.evaluations[0].matchedCount, 3);
    assert.equal(res.evaluations[0].earned, true);
  });

  it("no locking gate → unchanged behavior", () => {
    const res = verify(lockedMoments, [
      { id: "q", type: "quantity", minCount: 4, setId: 10, reward: "R" },
    ]);
    assert.equal(res.evaluations[0].matchedCount, 4);
  });
});

// -----------------------------------------------------------------
// parseRewardsConfig
// -----------------------------------------------------------------

describe("parseRewardsConfig()", () => {
  it("accepts the shipped config schema", () => {
    const cfg = parseRewardsConfig({
      rules: [
        { id: "a", type: "specific_moments", momentIds: [1], reward: "A" },
        { id: "b", type: "set_completion", setId: 1, totalPlays: 10, reward: "B" },
        { id: "c", type: "quantity", minCount: 1, reward: "C" },
      ],
    });
    assert.equal(cfg.rules.length, 3);
  });

  it("rejects duplicate rule ids", () => {
    assert.throws(
      () =>
        parseRewardsConfig({
          rules: [
            { id: "dup", type: "quantity", minCount: 1, reward: "A" },
            { id: "dup", type: "quantity", minCount: 2, reward: "B" },
          ],
        }),
      InvalidRuleError,
    );
  });

  it("rejects unknown rule types", () => {
    assert.throws(
      () =>
        parseRewardsConfig({
          rules: [{ id: "x", type: "nope", reward: "Z" }],
        }),
      InvalidRuleError,
    );
  });

  it("rejects non-positive minCount / totalPlays", () => {
    assert.throws(() =>
      parseRewardsConfig({
        rules: [{ id: "x", type: "quantity", minCount: 0, reward: "Z" }],
      }),
    );
    assert.throws(() =>
      parseRewardsConfig({
        rules: [
          { id: "x", type: "set_completion", setId: 1, totalPlays: 0, reward: "Z" },
        ],
      }),
    );
  });

  it("rejects minPercent out of (0, 100]", () => {
    assert.throws(() =>
      parseRewardsConfig({
        rules: [
          {
            id: "x",
            type: "set_completion",
            setId: 1,
            totalPlays: 10,
            minPercent: 150,
            reward: "Z",
          },
        ],
      }),
    );
  });

  // ---- Optional Moment-page URL fields (added April 2026) ----------
  // The dashboard renders "View on Top Shot" buttons for these. They're
  // metadata only — verifier never reads them — but the parser should
  // accept valid http(s) URLs and reject anything else.
  it("accepts http(s) URLs for rewardMomentUrl + challengeMomentUrl", () => {
    const cfg = parseRewardsConfig({
      rules: [
        {
          id: "with-urls",
          type: "quantity",
          minCount: 1,
          reward: "Z",
          rewardMomentUrl: "https://nbatopshot.com/listings/p2p/abc",
          challengeMomentUrl: "https://nbatopshot.com/listings/p2p/def",
        },
      ],
    });
    assert.strictEqual(cfg.rules.length, 1);
  });

  it("rejects malformed rewardMomentUrl", () => {
    assert.throws(
      () =>
        parseRewardsConfig({
          rules: [
            {
              id: "bad-url",
              type: "quantity",
              minCount: 1,
              reward: "Z",
              rewardMomentUrl: "not-a-url",
            },
          ],
        }),
      InvalidRuleError,
    );
  });

  it("rejects non-http(s) protocols on URL fields", () => {
    assert.throws(
      () =>
        parseRewardsConfig({
          rules: [
            {
              id: "bad-proto",
              type: "quantity",
              minCount: 1,
              reward: "Z",
              challengeMomentUrl: "javascript:alert(1)",
            },
          ],
        }),
      InvalidRuleError,
    );
  });

  it("treats empty-string URL fields as omitted", () => {
    const cfg = parseRewardsConfig({
      rules: [
        {
          id: "blanks-ok",
          type: "quantity",
          minCount: 1,
          reward: "Z",
          rewardMomentUrl: "",
          challengeMomentUrl: "",
        },
      ],
    });
    assert.strictEqual(cfg.rules.length, 1);
  });

  // ---------------------------------------------------------------------
  // tsrPoints — points awarded for completing a rule, displayed in the
  // "TSR" leaderboard. Validation: integer >= 0, optional.
  // ---------------------------------------------------------------------
  it("accepts a non-negative integer for tsrPoints", () => {
    const cfg = parseRewardsConfig({
      rules: [
        { id: "p1", type: "quantity", minCount: 1, reward: "Z", tsrPoints: 0 },
        { id: "p2", type: "quantity", minCount: 1, reward: "Z", tsrPoints: 50 },
      ],
    });
    assert.strictEqual(cfg.rules.length, 2);
  });

  it("rejects negative or non-integer tsrPoints", () => {
    for (const bad of [-1, 1.5, "10", null]) {
      assert.throws(
        () =>
          parseRewardsConfig({
            rules: [
              {
                id: "p",
                type: "quantity",
                minCount: 1,
                reward: "Z",
                tsrPoints: bad as unknown as number,
              },
            ],
          }),
        /tsrPoints/,
        `should reject ${JSON.stringify(bad)}`,
      );
    }
  });
});
