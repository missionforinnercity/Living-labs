import React, { useMemo } from 'react'

const RouteAnalyticsPanel = ({ data, mode }) => {
  const analytics = useMemo(() => {
    if (!data?.features || data.features.length === 0) {
      return null
    }

    const features = data.features

    // Initialize counters
    let totalTrips = 0
    let male = 0
    let female = 0
    let unknownGender = 0
    let age_13_19 = 0
    let age_20_34 = 0
    let age_35_54 = 0
    let age_55_64 = 0
    let age_65_plus = 0
    let commute = 0
    let recreation = 0

    // Aggregate data across all features
    features.forEach(feature => {
      const props = feature.properties

      totalTrips += props.total_trip_count || 0
      male += props.male || 0
      female += props.female || 0
      unknownGender += props.unknown_gender || 0
      age_13_19 += props.age_13_19 || 0
      age_20_34 += props.age_20_34 || 0
      age_35_54 += props.age_35_54 || 0
      age_55_64 += props.age_55_64 || 0
      age_65_plus += props.age_65_plus || 0
      commute += props.commute || 0
      recreation += props.recreation || 0
    })

    // Calculate percentages
    const totalIdentifiedGender = male + female + unknownGender
    const malePercent = totalIdentifiedGender > 0 ? ((male / totalIdentifiedGender) * 100).toFixed(1) : 0
    const femalePercent = totalIdentifiedGender > 0 ? ((female / totalIdentifiedGender) * 100).toFixed(1) : 0
    const unknownPercent = totalIdentifiedGender > 0 ? ((unknownGender / totalIdentifiedGender) * 100).toFixed(1) : 0

    const totalIdentifiedAge = age_13_19 + age_20_34 + age_35_54 + age_55_64 + age_65_plus
    const age_13_19_percent = totalIdentifiedAge > 0 ? ((age_13_19 / totalIdentifiedAge) * 100).toFixed(1) : 0
    const age_20_34_percent = totalIdentifiedAge > 0 ? ((age_20_34 / totalIdentifiedAge) * 100).toFixed(1) : 0
    const age_35_54_percent = totalIdentifiedAge > 0 ? ((age_35_54 / totalIdentifiedAge) * 100).toFixed(1) : 0
    const age_55_64_percent = totalIdentifiedAge > 0 ? ((age_55_64 / totalIdentifiedAge) * 100).toFixed(1) : 0
    const age_65_plus_percent = totalIdentifiedAge > 0 ? ((age_65_plus / totalIdentifiedAge) * 100).toFixed(1) : 0

    const totalPurpose = commute + recreation
    const commutePercent = totalPurpose > 0 ? ((commute / totalPurpose) * 100).toFixed(1) : 0
    const recreationPercent = totalPurpose > 0 ? ((recreation / totalPurpose) * 100).toFixed(1) : 0

    return {
      totalTrips,
      totalSegments: features.length,
      gender: {
        male: { count: male, percent: malePercent },
        female: { count: female, percent: femalePercent },
        unknown: { count: unknownGender, percent: unknownPercent },
        totalIdentified: totalIdentifiedGender
      },
      age: {
        age_13_19: { count: age_13_19, percent: age_13_19_percent },
        age_20_34: { count: age_20_34, percent: age_20_34_percent },
        age_35_54: { count: age_35_54, percent: age_35_54_percent },
        age_55_64: { count: age_55_64, percent: age_55_64_percent },
        age_65_plus: { count: age_65_plus, percent: age_65_plus_percent },
        totalIdentified: totalIdentifiedAge
      },
      purpose: {
        commute: { count: commute, percent: commutePercent },
        recreation: { count: recreation, percent: recreationPercent },
        total: totalPurpose
      }
    }
  }, [data])

  if (!analytics) {
    return null
  }

  const modeLabel = mode === 'pedestrian' ? 'Pedestrian' : 'Cycling'

  return (
    <div className="route-analytics-panel">
      <h4 className="analytics-title">{modeLabel} Route Analytics</h4>

      {/* Demographics - Gender */}
      <div className="analytics-section">
        <h5>User Demographics - Gender</h5>
        <div className="demographics-breakdown">
          <div className="demographic-item">
            <span className="demographic-label">Male</span>
            <span className="demographic-value">{analytics.gender.male.count}</span>
            <span className="demographic-percent">({analytics.gender.male.percent}%)</span>
          </div>
          <div className="demographic-item">
            <span className="demographic-label">Female</span>
            <span className="demographic-value">{analytics.gender.female.count}</span>
            <span className="demographic-percent">({analytics.gender.female.percent}%)</span>
          </div>
          {analytics.gender.unknown.count > 0 && (
            <div className="demographic-item">
              <span className="demographic-label">Unknown</span>
              <span className="demographic-value">{analytics.gender.unknown.count}</span>
              <span className="demographic-percent">({analytics.gender.unknown.percent}%)</span>
            </div>
          )}
        </div>
      </div>

      {/* Demographics - Age */}
      <div className="analytics-section">
        <h5>User Demographics - Age Groups</h5>
        <div className="demographics-breakdown">
          <div className="demographic-item">
            <span className="demographic-label">13-19</span>
            <span className="demographic-value">{analytics.age.age_13_19.count}</span>
            <span className="demographic-percent">({analytics.age.age_13_19.percent}%)</span>
          </div>
          <div className="demographic-item">
            <span className="demographic-label">20-34</span>
            <span className="demographic-value">{analytics.age.age_20_34.count}</span>
            <span className="demographic-percent">({analytics.age.age_20_34.percent}%)</span>
          </div>
          <div className="demographic-item">
            <span className="demographic-label">35-54</span>
            <span className="demographic-value">{analytics.age.age_35_54.count}</span>
            <span className="demographic-percent">({analytics.age.age_35_54.percent}%)</span>
          </div>
          <div className="demographic-item">
            <span className="demographic-label">55-64</span>
            <span className="demographic-value">{analytics.age.age_55_64.count}</span>
            <span className="demographic-percent">({analytics.age.age_55_64.percent}%)</span>
          </div>
          <div className="demographic-item">
            <span className="demographic-label">65+</span>
            <span className="demographic-value">{analytics.age.age_65_plus.count}</span>
            <span className="demographic-percent">({analytics.age.age_65_plus.percent}%)</span>
          </div>
        </div>
      </div>

      {/* Trip Purpose */}
      <div className="analytics-section">
        <h5>Trip Purpose</h5>
        <div className="purpose-breakdown">
          <div className="purpose-item">
            <span className="purpose-label">Commute</span>
            <span className="purpose-value">{analytics.purpose.commute.count}</span>
            <span className="purpose-percent">({analytics.purpose.commute.percent}%)</span>
            <div className="purpose-bar commute">
              <div className="purpose-fill" style={{ width: `${analytics.purpose.commute.percent}%` }}></div>
            </div>
          </div>
          <div className="purpose-item">
            <span className="purpose-label">Recreation</span>
            <span className="purpose-value">{analytics.purpose.recreation.count}</span>
            <span className="purpose-percent">({analytics.purpose.recreation.percent}%)</span>
            <div className="purpose-bar recreation">
              <div className="purpose-fill" style={{ width: `${analytics.purpose.recreation.percent}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="analytics-section summary-stats">
        <div className="stat-row">
          <span className="stat-label">Total Trips across all routes:</span>
          <span className="stat-value">{analytics.totalTrips.toLocaleString()}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Total Route Segments:</span>
          <span className="stat-value">{analytics.totalSegments.toLocaleString()}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Average trips per segment:</span>
          <span className="stat-value">{(analytics.totalTrips / analytics.totalSegments).toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}

export default RouteAnalyticsPanel
