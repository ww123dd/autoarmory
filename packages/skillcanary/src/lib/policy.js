'use strict';

const stats = require('./stats');

const ACTION_TYPES = [
  'add_rule',
  'remove_rule',
  'split_file',
  'change_route',
  'add_case',
  'add_hook',
  'change_tool_contract',
  'rollback'
];

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function actionOf(record) {
  return (record && record.action && record.action.type) || 'unknown';
}

function computeObjectives(record) {
  const outcome = record.outcome || {};
  const verification = record.verification || {};
  return {
    fixed: Array.isArray(outcome.fixed) ? outcome.fixed.length : number(outcome.fixed),
    regressed: Array.isArray(outcome.regressed) ? outcome.regressed.length : number(outcome.regressed),
    user_corrections: number(outcome.user_correction_delta !== undefined ? outcome.user_correction_delta : outcome.user_correction_count),
    rework_turns: number(outcome.rework_delta !== undefined ? outcome.rework_delta : outcome.rework_turns),
    tool_errors: number(outcome.tool_error_count),
    cost: number(outcome.cost_delta),
    verified: verification.result === 'pass' ? 1 : (verification.result === 'fail' ? -1 : 0)
  };
}

function computeReward(record) {
  const o = computeObjectives(record);
  const reward = o.fixed * 1.0
    - o.regressed * 2.0
    - o.user_corrections * 0.5
    - o.rework_turns * 0.25
    - o.tool_errors * 0.1
    - o.cost * 0.01
    + o.verified * 0.5;
  return Math.round(reward * 1000) / 1000;
}

function rewardVector(record) {
  const objectives = computeObjectives(record);
  return {
    reward: computeReward(record),
    objectives,
    risk: number(record.action && (record.action.risk || record.action.risk_level)),
    cost: objectives.cost,
    fixed: objectives.fixed,
    regressed: objectives.regressed
  };
}

function matchesContext(record, context) {
  if (!context) return true;
  const state = record.state || {};
  for (const key of Object.keys(context)) {
    if (context[key] === undefined || context[key] === null || context[key] === '') continue;
    const actual = state[key] !== undefined ? state[key] : (record[key] !== undefined ? record[key] : undefined);
    if (Array.isArray(context[key])) {
      if (context[key].indexOf(actual) === -1) return false;
    } else if (String(actual) !== String(context[key])) {
      return false;
    }
  }
  return true;
}

function summaryFor(group, action) {
  const rewards = group.map(function (record) { return rewardVector(record).reward; });
  const objectives = group.map(function (record) { return computeObjectives(record); });
  const meanReward = stats.mean(rewards);
  return {
    action,
    count: rewards.length,
    mean: meanReward,
    variance: stats.variance(rewards),
    stddev: stats.stddev(rewards),
    p50: stats.quantile(rewards, 0.5),
    p90: stats.quantile(rewards, 0.9),
    objectives: {
      fixed: stats.mean(objectives.map(function (o) { return o.fixed; })),
      regressed: stats.mean(objectives.map(function (o) { return o.regressed; })),
      user_corrections: stats.mean(objectives.map(function (o) { return o.user_corrections; })),
      rework_turns: stats.mean(objectives.map(function (o) { return o.rework_turns; })),
      tool_errors: stats.mean(objectives.map(function (o) { return o.tool_errors; })),
      cost: stats.mean(objectives.map(function (o) { return o.cost; }))
    }
  };
}

function summarize(records, context) {
  const filtered = (records || []).filter(function (record) { return matchesContext(record, context); });
  const groups = {};
  for (const record of filtered) {
    const action = actionOf(record);
    if (!groups[action]) groups[action] = [];
    groups[action].push(record);
  }
  return Object.keys(groups).sort().map(function (action) {
    return summaryFor(groups[action], action);
  });
}

function actionRisk(action) {
  if (typeof action === 'object' && action) return number(action.risk !== undefined ? action.risk : action.risk_level);
  return 0;
}

function maskRecommendation(item, constraints) {
  const c = constraints || {};
  const reasons = [];
  if (Array.isArray(c.deny) && c.deny.indexOf(item.action) !== -1) reasons.push('action is denied by policy');
  if (Array.isArray(c.allow) && c.allow.length && c.allow.indexOf(item.action) === -1) reasons.push('action is not in the allow list');
  if (c.maxRisk !== undefined && number(item.risk) > number(c.maxRisk)) reasons.push('action risk exceeds maxRisk');
  if (c.minSamples !== undefined && item.count < number(c.minSamples)) reasons.push('action has insufficient samples');
  return reasons;
}

function recommend(records, context, top, options) {
  const opts = options || {};
  const algorithm = opts.algorithm || 'ucb';
  const filtered = (records || []).filter(function (record) { return matchesContext(record, context); });
  const statsByAction = summarize(filtered);
  const total = filtered.length || 1;
  const rng = stats.makeRng(opts.seed || 1);
  const scored = statsByAction.map(function (item) {
    const unitValues = filtered.filter(function (record) { return actionOf(record) === item.action; }).map(function (record) {
      return stats.sigmoid(rewardVector(record).reward);
    });
    const posterior = stats.betaPosterior(unitValues, opts.priorAlpha || 1, opts.priorBeta || 1);
    let score = item.mean;
    let ucb = stats.ucbScore(item.mean, item.count, total, opts.exploration);
    const thompson = stats.sampleBeta(posterior.alpha, posterior.beta, rng);
    if (algorithm === 'thompson') score = thompson;
    else if (algorithm === 'hybrid') score = 0.65 * ucb + 0.35 * thompson;
    else if (algorithm === 'greedy') score = item.mean;
    else score = ucb;
    const masked = maskRecommendation(Object.assign({}, item, { risk: opts.actionRisk && opts.actionRisk[item.action] }), opts.constraints);
    return Object.assign({}, item, {
      ucb,
      thompson,
      posterior: { alpha: posterior.alpha, beta: posterior.beta, mean: posterior.mean },
      score,
      masked: masked.length > 0,
      mask_reasons: masked
    });
  }).filter(function (item) { return !item.masked; }).sort(function (a, b) { return b.score - a.score; });

  return {
    context: context || {},
    algorithm,
    considered: filtered.length,
    recommendations: scored.slice(0, top || 3),
    masked: statsByAction.length - scored.length,
    drift: drift(filtered, { window: opts.window || 10, threshold: opts.driftThreshold || 5 })
  };
}

function pareto(records, context, options) {
  const filtered = (records || []).filter(function (record) { return matchesContext(record, context); });
  const actions = summarize(filtered).map(function (item) { return item.action; });
  const items = actions.map(function (action) {
    const summary = summarize(filtered).find(function (item) { return item.action === action; });
    return {
      action,
      objectives: {
        fixed: summary.objectives.fixed,
        regressed: -summary.objectives.regressed,
        corrections: -summary.objectives.user_corrections,
        rework: -summary.objectives.rework_turns,
        tool_errors: -summary.objectives.tool_errors,
        cost: -summary.objectives.cost,
        reward: summary.mean
      },
      summary
    };
  });
  const specs = [
    { key: 'fixed', direction: 'max' },
    { key: 'regressed', direction: 'max' },
    { key: 'corrections', direction: 'max' },
    { key: 'rework', direction: 'max' },
    { key: 'tool_errors', direction: 'max' },
    { key: 'cost', direction: 'max' },
    { key: 'reward', direction: 'max' }
  ];
  return stats.paretoFrontier(items, specs);
}

function drift(records, options) {
  const opts = options || {};
  const groups = {};
  for (const record of records || []) {
    const key = actionOf(record);
    if (!groups[key]) groups[key] = [];
    groups[key].push(rewardVector(record).reward);
  }
  return Object.keys(groups).map(function (action) {
    const values = groups[action].slice(-(opts.window || 20));
    const result = stats.cusum(values, { threshold: opts.threshold || 5, drift: opts.drift || 0.5 });
    return Object.assign({ action, samples: values.length }, result);
  }).sort(function (a, b) { return b.score - a.score; });
}

function simulate(options) {
  const opts = options || {};
  const actions = opts.actions || ACTION_TYPES;
  const horizons = opts.horizon || 100;
  const rng = stats.makeRng(opts.seed || 1);
  const truth = {};
  for (const action of actions) truth[action] = { mean: (rng() - 0.35) * 2, sd: 0.35 + rng() * 0.5 };
  const algorithms = ['greedy', 'ucb', 'thompson', 'hybrid'];
  const result = {};
  for (const algorithm of algorithms) {
    const counts = {};
    const rewards = {};
    for (const action of actions) { counts[action] = 0; rewards[action] = []; }
    let total = 0;
    for (let i = 0; i < horizons; i++) {
      let action;
      if (algorithm === 'greedy') {
        action = actions.slice().sort(function (a, b) {
          const am = rewards[a].length ? stats.mean(rewards[a]) : -Infinity;
          const bm = rewards[b].length ? stats.mean(rewards[b]) : -Infinity;
          return bm - am;
        })[0];
      } else if (algorithm === 'ucb') {
        action = actions.slice().sort(function (a, b) {
          const am = stats.ucbScore(rewards[a].length ? stats.mean(rewards[a]) : 0, counts[a], i + 1);
          const bm = stats.ucbScore(rewards[b].length ? stats.mean(rewards[b]) : 0, counts[b], i + 1);
          return bm - am;
        })[0];
      } else if (algorithm === 'thompson') {
        action = actions.slice().sort(function (a, b) {
          const ap = stats.sampleBeta(1 + rewards[a].filter(function (x) { return x > 0; }).length, 1 + rewards[a].filter(function (x) { return x <= 0; }).length, rng);
          const bp = stats.sampleBeta(1 + rewards[b].filter(function (x) { return x > 0; }).length, 1 + rewards[b].filter(function (x) { return x <= 0; }).length, rng);
          return bp - ap;
        })[0];
      } else {
        action = actions.slice().sort(function (a, b) {
          const au = stats.ucbScore(rewards[a].length ? stats.mean(rewards[a]) : 0, counts[a], i + 1);
          const bu = stats.ucbScore(rewards[b].length ? stats.mean(rewards[b]) : 0, counts[b], i + 1);
          const ap = stats.sampleBeta(1 + rewards[a].filter(function (x) { return x > 0; }).length, 1 + rewards[a].filter(function (x) { return x <= 0; }).length, rng);
          const bp = stats.sampleBeta(1 + rewards[b].filter(function (x) { return x > 0; }).length, 1 + rewards[b].filter(function (x) { return x <= 0; }).length, rng);
          return (0.65 * bu + 0.35 * bp) - (0.65 * au + 0.35 * ap);
        })[0];
      }
      const value = truth[action].mean + boxMullerLocal(rng) * truth[action].sd;
      counts[action] += 1;
      rewards[action].push(value);
      total += value;
    }
    result[algorithm] = {
      total_reward: total,
      mean_reward: total / horizons,
      counts,
      best_action: actions.slice().sort(function (a, b) { return stats.mean(rewards[b]) - stats.mean(rewards[a]); })[0]
    };
  }
  return { schema_version: 'skillcanary/policy-simulation/v1', horizon: horizons, seed: opts.seed || 1, actions, truth, algorithms: result };
}

function boxMullerLocal(rng) {
  const u = Math.max(rng(), Number.EPSILON);
  const v = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

module.exports = {
  ACTION_TYPES,
  computeObjectives,
  computeReward,
  rewardVector,
  summarize,
  recommend,
  pareto,
  drift,
  simulate
};
