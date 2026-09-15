'use strict';

function successValue(item) {
  if (item.result === 'success') return 1;
  if (item.result === 'partial') return 0.5;
  return 0;
}

function eligible(outcomes, options, needProbability) {
  const opts = options || {};
  const list = (outcomes || []).filter(function (item) { return item.verified === true; });
  if (list.some(function (item) { return item.source === 'fixture'; })) return { status: 'synthetic_data', errors: ['synthetic fixture outcomes cannot calibrate or update policy'], samples: list.length };
  const usable = list.filter(function (item) {
    if (!Number.isFinite(Number(item.reward))) return false;
    if (needProbability && (!Number.isFinite(Number(item.predicted_probability)) || Number(item.predicted_probability) < 0 || Number(item.predicted_probability) > 1)) return false;
    return true;
  });
  if (usable.length < Number(opts.min || 30)) return { status: 'insufficient_data', errors: ['need at least ' + Number(opts.min || 30) + ' verified outcome samples'], samples: usable.length };
  return { status: 'ready', samples: usable, count: usable.length };
}

function calibrate(outcomes, options) {
  const ready = eligible(outcomes, options, true);
  if (ready.status !== 'ready') return { schema_version: 'autoarmory/calibration/v1', status: ready.status, samples: ready.samples || 0, errors: ready.errors };
  const list = ready.samples;
  const bins = Array.from({ length: 10 }, function () { return { count: 0, probability: 0, observed: 0 }; });
  let brier = 0;
  let logLoss = 0;
  for (const item of list) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, Number(item.predicted_probability)));
    const y = successValue(item);
    brier += Math.pow(p - y, 2);
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    const index = Math.min(9, Math.floor(p * 10));
    bins[index].count += 1;
    bins[index].probability += p;
    bins[index].observed += y;
  }
  let ece = 0;
  for (const bin of bins) {
    if (!bin.count) continue;
    const avgP = bin.probability / bin.count;
    const avgY = bin.observed / bin.count;
    ece += (bin.count / list.length) * Math.abs(avgP - avgY);
  }
  return { schema_version: 'autoarmory/calibration/v1', status: 'calibrated', samples: list.length, brier: brier / list.length, log_loss: logLoss / list.length, ece: ece, bins: bins };
}

function offPolicyEvaluate(outcomes, options) {
  const ready = eligible(outcomes, options, false);
  if (ready.status !== 'ready') return { schema_version: 'autoarmory/off-policy/v1', status: ready.status, samples: ready.samples || 0, errors: ready.errors };
  const list = ready.samples.filter(function (item) { return Number(item.propensity) > 0 && Number(item.propensity) <= 1; });
  if (list.length < Number((options && options.min) || 30)) return { schema_version: 'autoarmory/off-policy/v1', status: 'insufficient_data', samples: list.length, errors: ['insufficient positive propensity samples'] };
  let sum = 0;
  let weightSum = 0;
  let weightSquareSum = 0;
  for (const item of list) {
    const weight = 1 / Number(item.propensity);
    sum += weight * Number(item.reward);
    weightSum += weight;
    weightSquareSum += weight * weight;
  }
  return { schema_version: 'autoarmory/off-policy/v1', status: 'evaluated', samples: list.length, ips: sum / list.length, effective_samples: (weightSum * weightSum) / weightSquareSum };
}

module.exports = { calibrate, offPolicyEvaluate };
