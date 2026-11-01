import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export const EMPTY_CLIENT = {
  clientCode: '', lastName: '', firstName: '', nationality: 'Tunisienne', nationalityOther: '', country: 'Tunisie',
  birthDate: '', birthPlace: '', profession: '', civilStatus: '', title: '',
  identityNumber: '', identityDate: '', identityPlace: '', licenseNumber: '', licenseDate: '', licensePlace: '',
  relatedCode: '', relatedName: '', relationship: '', referenceCode: '',
  homeAddress: '', homeCity: '', homePostalCode: '', homeFax: '',
  homePhones: Array.from({ length: 4 }, () => ({ value: '', label: '' })),
  homeEmails: Array.from({ length: 3 }, () => ({ value: '', label: '' })),
  officeAddress: '', officeCity: '', officePostalCode: '', officeFax: '',
  officePhones: Array.from({ length: 4 }, () => ({ value: '', label: '' })),
  officeEmails: Array.from({ length: 3 }, () => ({ value: '', label: '' })),
  correspondence: 'Bureau', clientType: 'Particulier', taxExempt: false, notes: '',
  companyName: 'Assurance Jemmali', companyCode: '', companyAgency: 'Siege', companyPhone: '', companyEmail: '',
  agencyCode: '', companyContact: '', companyMobile: '', createdAt: new Date().toISOString().slice(0, 10),
};

const ClientContext = createContext(null);

// The client being viewed / modified is kept for the browser tab, so the fiche client survives a page refresh.
const STORAGE_KEY = 'assurance-current-client';
function storedClient() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...EMPTY_CLIENT, ...saved } : EMPTY_CLIENT;
  } catch {
    return EMPTY_CLIENT;
  }
}

export function ClientProvider({ children }) {
  const { user, isLoading } = useAuth();
  const [client, setClient] = useState(storedClient);

  useEffect(() => {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client)); } catch { /* storage unavailable: the fiche just won't survive a refresh */ }
  }, [client]);

  // Signed out: the next user starts on an empty fiche.
  useEffect(() => {
    if (isLoading || user) return;
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setClient(EMPTY_CLIENT);
  }, [user, isLoading]);
  const [clients, setClients] = useState([]);
  const value = useMemo(() => ({ client, setClient, clients, setClients }), [client, clients]);
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useClient must be used within ClientProvider');
  return context;
}
