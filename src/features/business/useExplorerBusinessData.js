import { useEffect, useState } from 'react'
import { loadExplorerBusinessBoundary, loadExplorerBusinessData } from './data'

const BUSINESS_POI_LAYERS = ['businessLiveliness', 'businessRatings', 'amenities', 'businessCategories']
const BUSINESS_DATA_LAYERS = [...BUSINESS_POI_LAYERS, 'vendorOpinions', 'cityEvents']
const PARCEL_DATA_LAYERS = ['landParcels', 'openSpaces', 'parcelSales']

export function useExplorerBusinessData({ dashboardMode, activeCategory, lockedLayers }) {
  const [businessesData, setBusinessesData] = useState(null)
  const [streetStallsData, setStreetStallsData] = useState(null)
  const [parcelSalesData, setParcelSalesData] = useState(null)
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
        const includeParcelSales = requestedLayers.has('parcelSales')
        const includeEvents = requestedLayers.has('cityEvents')
        const includeLandParcels = requestedLayers.has('landParcels')
        const includeOpenSpaces = requestedLayers.has('openSpaces')
        const { businesses, streetStalls, parcelSales, survey, eventsData, landParcels, openSpaces } = await loadExplorerBusinessData({
          includeBusinesses,
          includeStreetStalls,
          includeParcelSales,
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
          parcelSales: parcelSales?.features?.length,
          survey: survey?.features?.length
        })

        if (includeBusinesses) setBusinessesData(businesses)
        if (includeStreetStalls) setStreetStallsData(streetStalls)
        if (includeParcelSales) setParcelSalesData(parcelSales)
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
    parcelSalesData,
    landParcelsData,
    openSpacesData,
    surveyData,
    eventsData,
    ccidBoundary
  }
}
