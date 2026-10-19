import { createContext, useContext, useMemo, useState } from 'react';

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
  correspondence: 'Bureau', clientType: 'Societe', taxExempt: false, notes: '',
  companyName: 'Assurance Jemmali', companyCode: '', companyAgency: 'Siege', companyPhone: '', companyEmail: '',
  agencyCode: '', companyContact: '', companyMobile: '', createdAt: new Date().toISOString().slice(0, 10),
};

const ClientContext = createContext(null);

export function ClientProvider({ children }) {
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [clients, setClients] = useState([]);
  const value = useMemo(() => ({ client, setClient, clients, setClients }), [client, clients]);
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useClient must be used within ClientProvider');
  return context;
}
