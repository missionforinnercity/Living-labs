import { useEffect, useState } from 'react'
import { loadExplorerBusinessBoundary, loadExplorerBusinessData } from './data'

const BUSINESS_POI_LAYERS = ['businessLiveliness', 'businessRatings', 'amenities', 'businessCategories']
const BUSINESS_DATA_LAYERS = [...BUSINESS_POI_LAYERS, 'vendorOpinions', 'propertySales', 'cityEvents']
const PARCEL_DATA_LAYERS = ['landParcels', 'openSpaces']

export function useExplorerBusinessData({ dashboardMode, activeCategory, lockedLayers }) {
  const [businessesData, setBusinessesData] = useState(null)
  const [streetStallsData, setStreetStallsData] = useState(null)
  const [propertiesData, setPropertiesData] = useState(null)
  const [landParcelsData, setLandParcelsData] = useState(null)
  const [openSpacesData, setOpenSpacesData] = useState(null)
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
        const requestedLayers = new Set([...lockedLayers])
        const isActiveBusinessLayer = BUSINESS_DATA_LAYERS.includes(activeCategory)
        const isActiveParcelLayer = PARCEL_DATA_LAYERS.includes(activeCategory)
        if (isActiveBusinessLayer || isActiveParcelLayer) requestedLayers.add(activeCategory)
        if (dashboardMode === 'business' && !isActiveBusinessLayer) requestedLayers.add('businessLiveliness')
        if (dashboardMode === 'landParcels' && !isActiveParcelLayer) requestedLayers.add('landParcels')

        const includeBusinesses = BUSINESS_POI_LAYERS.some((id) => requestedLayers.has(id))
        const includeStreetStalls = requestedLayers.has('vendorOpinions')
        const includeSurvey = requestedLayers.has('vendorOpinions')
        const includeProperties = requestedLayers.has('propertySales')
        const includeEvents = requestedLayers.has('cityEvents')
        const includeLandParcels = requestedLayers.has('landParcels')
        const includeOpenSpaces = requestedLayers.has('openSpaces')
        const { businesses, streetStalls, properties, survey, eventsData, landParcels, openSpaces } = await loadExplorerBusinessData({
          includeBusinesses,
          includeStreetStalls,
          includeProperties,
          includeSurvey,
          includeEvents,
          includeLandParcels,
          includeOpenSpaces
        })

        console.log('Business data loaded:', {
          landParcels: landParcels?.features?.length,
          openSpaces: openSpaces?.features?.length,
          businesses: businesses?.features?.length,
          stalls: streetStalls?.features?.length,
          properties: properties?.features?.length,
          survey: survey?.features?.length
        })

        if (properties?.features?.length) {
          console.log('Sample processed property:', properties.features?.[0]?.properties)
        }

        if (includeBusinesses) setBusinessesData(businesses)
        if (includeStreetStalls) setStreetStallsData(streetStalls)
        if (includeProperties) setPropertiesData(properties)
        if (survey) setSurveyData(survey)
        if (includeEvents) setEventsData(eventsData)
        if (includeLandParcels) setLandParcelsData(landParcels)
        if (includeOpenSpaces) setOpenSpacesData(openSpaces)
      } catch (error) {
        console.error('Error loading business data:', error)
      }
    }

    const hasLockedBusinessLayer = BUSINESS_DATA_LAYERS.some((id) => lockedLayers.has(id))
    const hasLockedParcelLayer = PARCEL_DATA_LAYERS.some((id) => lockedLayers.has(id))
    if (dashboardMode === 'business' || dashboardMode === 'landParcels' || hasLockedBusinessLayer || hasLockedParcelLayer) {
      loadBusinessExplorerState()
    }
  }, [activeCategory, dashboardMode, lockedLayers])

  return {
    businessesData,
    streetStallsData,
    propertiesData,
    landParcelsData,
    openSpacesData,
    surveyData,
    eventsData,
    ccidBoundary
  }
}
