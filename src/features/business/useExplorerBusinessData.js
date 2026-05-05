import { useEffect, useState } from 'react'
import { loadExplorerBusinessBoundary, loadExplorerBusinessData } from './data'

export function useExplorerBusinessData({ dashboardMode, lockedLayers }) {
  const [businessesData, setBusinessesData] = useState(null)
  const [streetStallsData, setStreetStallsData] = useState(null)
  const [propertiesData, setPropertiesData] = useState(null)
  const [landParcelsData, setLandParcelsData] = useState(null)
  const [surveyData, setSurveyData] = useState(null)
  const [eventsData, setEventsData] = useState(null)
  const [ccidBoundary, setCcidBoundary] = useState(null)

  useEffect(() => {
    loadExplorerBusinessBoundary()
      .then(setCcidBoundary)
      .catch((error) => console.error('Error loading CCID boundary:', error))
  }, [])

  useEffect(() => {
    const loadBusinessExplorerState = async () => {
      try {
        const { businesses, streetStalls, properties, survey, eventsData, landParcels } = await loadExplorerBusinessData()

        console.log('Business data loaded:', {
          businesses: businesses.features?.length,
          stalls: streetStalls.features?.length,
          properties: properties.features?.length,
          survey: survey.features?.length,
          landParcels: landParcels.features?.length
        })

        console.log('Sample processed property:', properties.features?.[0]?.properties)

        setBusinessesData(businesses)
        setStreetStallsData(streetStalls)
        setPropertiesData(properties)
        setLandParcelsData(landParcels)
        setSurveyData(survey)
        setEventsData(eventsData)
      } catch (error) {
        console.error('Error loading business data:', error)
      }
    }

    const hasLockedBusinessLayer = ['businessLiveliness', 'vendorOpinions', 'businessRatings', 'amenities', 'businessCategories', 'propertySales', 'cityEvents', 'landParcels'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'business' || hasLockedBusinessLayer) {
      loadBusinessExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  return {
    businessesData,
    streetStallsData,
    propertiesData,
    landParcelsData,
    surveyData,
    eventsData,
    ccidBoundary
  }
}
