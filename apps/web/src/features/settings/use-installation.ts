import { useQuery } from '@tanstack/react-query'
import { getInstallationStatus, installationQueryKey } from './installation-api'

// Every installation screen reads this; the layout route already primes the cache with the same
// key, so only the first screen ever pays for the request.
export const useInstallation = () => useQuery({ queryKey: installationQueryKey, queryFn: getInstallationStatus })
