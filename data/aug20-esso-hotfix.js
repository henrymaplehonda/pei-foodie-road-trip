// Aug 20 fuel-plan hotfix added Aug 19, 2026.
// Keeps the existing safety-break structure but makes the requested
// Rivière-Verte Esso the planned fuel stop before Edmundston.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug20EssoPracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug20EssoPracticalBase(helpers) || {};

    practical['d7-riviere-verte-esso'] = {
      'Why / duration': 'Requested preferred-brand fuel stop on the northern New Brunswick leg · about 10–15 minutes.',
      'Fuel': 'Primary planned Thursday fuel stop: Esso, 75 Chem. Davis, Rivière-Verte, NB E7C 2S8. Fill here before continuing to Edmundston.',
      'Safety rule': 'Treat Woodstock as the earlier safety reset. This Esso is the fuel anchor; never stretch range or fatigue just to reach it.'
    };

    if (practical['d7-woodstock-shell']) {
      practical['d7-woodstock-shell']['Fuel'] = 'Preferred-brand backup only. The primary planned fuel stop is now Esso, 75 Chem. Davis, Rivière-Verte, NB E7C 2S8.';
    }

    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug20EssoPlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug20EssoPlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers || typeof helpers.customStop !== 'function') return plan;

    var customStop = helpers.customStop;
    var mapSearchUrl = helpers.mapSearchUrl;
    var day = plan.days.find(function (item) { return item && item.id === '2026-08-20'; });
    if (!day || !Array.isArray(day.stops)) return plan;

    plan.generatedOn = '2026-08-19';
    day.routeFocus = 'Best Western Plus Moncton → Lincoln/Waasis break → Shell Woodstock safety break → Esso Rivière-Verte fuel → Edmundston lunch → Halte de Fraserville → Shell Saint-Roch-des-Aulnaies → La Fabrique du Smoked Meat → DoubleTree Quebec Resort';

    var woodstock = day.stops.find(function (stop) { return stop && stop.id === 'd7-woodstock-shell'; });
    if (woodstock) {
      woodstock.title = 'Shell Woodstock — safety break / fuel backup';
      woodstock.kind = 'Safety break / preferred fuel backup';
      woodstock.notes = 'Keep this stop for the driving-time safety reset. Fuel here only if useful or needed; the primary planned fuel stop is the Esso in Rivière-Verte.';
    }

    var existingEsso = day.stops.some(function (stop) { return stop && stop.id === 'd7-riviere-verte-esso'; });
    if (!existingEsso) {
      var essoStop = customStop({
        id: 'd7-riviere-verte-esso', dayId: '2026-08-20', time: 'Before Edmundston lunch', zone: 'ADT',
        title: 'Esso Rivière-Verte — planned fuel stop',
        locationName: 'Esso',
        kind: 'Preferred fuel / washroom / stretch', priority: 'required',
        address: '75 Chem. Davis, Rivière-Verte, NB E7C 2S8', city: 'Rivière-Verte, NB',
        timeBudget: '10-15 min',
        notes: 'Requested primary gas stop for Thursday. Fill here, use the washroom if needed, then continue to the Edmundston lunch stop.',
        food: 'Quick snack only if needed; proper lunch remains Edmundston.',
        kidPlan: 'Brief movement and bathroom stop if needed.',
        mapUrl: mapSearchUrl('Esso, 75 Chem. Davis, Rivière-Verte, NB E7C 2S8'),
        sourceUrl: mapSearchUrl('Esso, 75 Chem. Davis, Rivière-Verte, NB E7C 2S8')
      });

      var woodstockIndex = day.stops.findIndex(function (stop) { return stop && stop.id === 'd7-woodstock-shell'; });
      var edmundstonIndex = day.stops.findIndex(function (stop) { return stop && stop.id === 'd7-edmundston-shared'; });
      var insertAt = woodstockIndex >= 0 ? woodstockIndex + 1 : (edmundstonIndex >= 0 ? edmundstonIndex : day.stops.length);
      day.stops.splice(insertAt, 0, essoStop);
    }

    var edmundston = day.stops.find(function (stop) { return stop && stop.id === 'd7-edmundston-shared'; });
    if (edmundston) {
      edmundston.notes = 'Proper lunch and full out-of-car reset. Planned fuel is handled at the Rivière-Verte Esso immediately before this leg; refuel again here only if range actually requires it.';
    }

    return plan;
  };
}
