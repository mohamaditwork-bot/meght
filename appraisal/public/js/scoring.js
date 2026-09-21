/* =============================================================
   Scoring engine
   ============================================================= */
(function () {
  const D = window.APPRAISAL_DATA;

  function getDepartment(deptId) {
    return D.DEPARTMENTS.find((d) => d.id === deptId) || null;
  }

  // ratings: direct points entered for each criterion. The criterion weight is the hard upper limit.
  function itemPoints(weight, rating) {
    const max = Math.max(0, Number(weight) || 0);
    const entered = Math.max(0, Number(rating) || 0);
    return +Math.min(max, entered).toFixed(2);
  }

  function coreScore(ratings) {
    let earned = 0;
    D.CORE_SECTIONS.forEach((sec) => {
      sec.items.forEach((it) => {
        earned += itemPoints(it.weight, ratings["core." + it.id]);
      });
    });
    return +earned.toFixed(2);
  }

  function sectionScore(section, ratings) {
    let earned = 0, max = 0;
    section.items.forEach((it) => {
      max += it.weight;
      earned += itemPoints(it.weight, ratings["core." + it.id]);
    });
    return { earned: +earned.toFixed(2), max };
  }

  function deptScore(deptId, ratings) {
    const dep = getDepartment(deptId);
    if (!dep) return 0;
    let earned = 0;
    dep.items.forEach((it) => {
      earned += itemPoints(it.weight, ratings["dept." + it.id]);
    });
    return +earned.toFixed(2);
  }

  function performanceLevel(pct) {
    return D.PERFORMANCE_LEVELS.find((l) => pct >= l.min) || D.PERFORMANCE_LEVELS[D.PERFORMANCE_LEVELS.length - 1];
  }

  // Full computation for a given ratings map + deptId
  function compute(deptId, ratings) {
    const core = coreScore(ratings);
    const dep = deptScore(deptId, ratings);
    const total = +(core + dep).toFixed(2);
    const pct = +((total / D.TOTAL_MAX) * 100).toFixed(1);
    const level = performanceLevel(pct);
    return {
      core, dept: dep, total, pct, level,
      coreMax: D.CORE_MAX, deptMax: D.DEPT_MAX, totalMax: D.TOTAL_MAX
    };
  }

  window.SCORING = { getDepartment, itemPoints, coreScore, sectionScore, deptScore, performanceLevel, compute };
})();
