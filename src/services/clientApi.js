const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export async function listClients(accessToken) {
  const limit = 500;
  let offset = 0;
  const clients = [];
  let hasMore = true;

  while (hasMore) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/api/clients?limit=${limit}&offset=${offset}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré et que CORS autorise cette adresse.`);
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger la liste des clients.');
    }
    const page = Array.isArray(body.items) ? body.items : [];
    clients.push(...page);
    hasMore = page.length === limit;
    offset += page.length;
  }

  return clients;
}

export async function getClientByCode(accessToken, code) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/clients/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Client introuvable.');
  return normalizeClientRecord(body);
}

export function toClientPayload(client) {
  const civilStatus = { Celibataire: 'C', 'Marie(e)': 'M', 'Divorce(e)': 'D', 'Veuf / Veuve': 'V' };
  const dateTimestamp = (value) => value ? `${value.slice(0, 10)}T00:00:00` : null;
  const dateOnly = (value) => value ? value.slice(0, 10) : null;
  const homePhones = client.homePhones || [{ value: client.homePhone || '', label: '' }];
  const homeEmails = client.homeEmails || [];
  const officePhones = client.officePhones || [{ value: client.officePhone || '', label: '' }, { value: client.officePhone2 || '', label: '' }];
  const officeEmails = client.officeEmails || [{ value: client.email || '', label: '' }];
  return {
    code_client: String(client.clientCode || '').trim(),
    nom_client: [client.lastName, client.firstName].filter(Boolean).join(' ').trim() || null,
    code_locuteur: client.relatedCode || null,
    nom_locuteur: client.relatedName || null,
    date_creation: client.date_creation || dateTimestamp(client.createdAt || new Date().toISOString().slice(0, 10)),
    profession: client.profession || null,
    adresse: client.homeAddress || null,
    ville: client.homeCity || null,
    cp: client.homePostalCode === '' ? null : Number(client.homePostalCode),
    tel: homePhones[0]?.value || client.homePhone || null,
    fax: client.homeFax || null,
    adresse_b: client.officeAddress || null,
    ville_b: client.officeCity || null,
    cp_b: client.officePostalCode === '' ? null : Number(client.officePostalCode),
    tel_b: officePhones[0]?.value || client.officePhone || null,
    tel_b2: officePhones[1]?.value || client.officePhone2 || null,
    fax_b: client.officeFax || null,
    adresse_email: officeEmails[0]?.value || client.email || null,
    telephones_domicile: homePhones,
    emails_domicile: homeEmails,
    telephones_bureau: officePhones,
    emails_bureau: officeEmails,
    Correspondant: client.correspondence === 'Domicile' ? 'D' : 'B',
    Nom: client.lastName || null,
    Prenom: client.firstName || null,
    DateNaissance: dateOnly(client.birthDate),
    Exonerer: client.taxExempt ? 'O' : 'N',
    NumeroCIN: client.identityNumber || null,
    LieuCIN: client.identityPlace || null,
    DateCIN: dateOnly(client.identityDate),
    Pays: client.country || null,
    Nationnalite: client.nationality === 'Autre' ? (client.nationalityOther || 'Autre') : (client.nationality || null),
    LieuNaissance: client.birthPlace || null,
    Sit_Fam: civilStatus[client.civilStatus] || null,
    Titre: client.title || null,
    NumeroPermis: client.licenseNumber || null,
    LieuPermis: client.licensePlace || null,
    DatePermis: dateOnly(client.licenseDate),
    Type_Client: client.clientType === 'Societe' ? 'S' : 'P',
    observ: client.notes || null,
    code_agence: client.agencyCode || null,
    code_com: client.companyCode === '' ? null : Number(client.companyCode),
    contact: client.companyContact || null,
    code: client.referenceCode === '' ? null : Number(client.referenceCode),
    tel_contact: client.companyPhone || null,
    mobile: client.companyMobile || null,
  };
}

export async function saveClient(accessToken, client, isUpdate = false) {
  const code = encodeURIComponent(client.clientCode);
  const url = isUpdate ? `${API_BASE_URL}/api/clients/${code}` : `${API_BASE_URL}/api/clients`;
  let response;
  try {
    response = await fetch(url, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(toClientPayload(client)),
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré et que CORS autorise cette adresse.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible d’enregistrer le client.');
  return normalizeClientRecord(body);
}

export function normalizeClientRecord(record) {
  const type = record.Type_Client;
  const homePhones = record.telephones_domicile || [{ value: record.tel || '', label: '' }, ...Array.from({ length: 3 }, () => ({ value: '', label: '' }))];
  const homeEmails = record.emails_domicile || Array.from({ length: 3 }, (_, index) => ({ value: '', label: '' }));
  const officePhones = record.telephones_bureau || [{ value: record.tel_b || '', label: '' }, { value: record.tel_b2 || '', label: '' }, { value: '', label: '' }, { value: '', label: '' }];
  const officeEmails = record.emails_bureau || [{ value: record.adresse_email || '', label: '' }, { value: '', label: '' }, { value: '', label: '' }];
  return {
    ...record,
    clientCode: record.code_client || record.clientCode || '',
    lastName: record.Nom || record.lastName || '',
    firstName: record.Prenom || record.firstName || '',
    nationality: ['Tunisienne', 'Italienne'].includes(record.Nationnalite) ? record.Nationnalite : record.Nationnalite ? 'Autre' : (record.nationality || ''),
    nationalityOther: record.Nationnalite && !['Tunisienne', 'Italienne', 'Autre'].includes(record.Nationnalite) ? record.Nationnalite : record.nationalityOther || '',
    homePhones,
    homeEmails,
    officePhones,
    officeEmails,
    country: record.Pays || record.country || '',
    birthDate: String(record.DateNaissance || record.birthDate || '').slice(0, 10),
    birthPlace: record.LieuNaissance || record.birthPlace || '',
    profession: record.profession || '',
    civilStatus: ({ C: 'Celibataire', M: 'Marie(e)', D: 'Divorce(e)', V: 'Veuf / Veuve' })[record.Sit_Fam] || record.civilStatus || '',
    title: record.Titre || record.title || '',
    identityNumber: record.NumeroCIN || record.identityNumber || '',
    identityDate: String(record.DateCIN || record.identityDate || '').slice(0, 10),
    identityPlace: record.LieuCIN || record.identityPlace || '',
    licenseNumber: record.NumeroPermis || record.licenseNumber || '',
    licenseDate: String(record.DatePermis || record.licenseDate || '').slice(0, 10),
    licensePlace: record.LieuPermis || record.licensePlace || '',
    relatedCode: record.code_locuteur || record.relatedCode || '',
    relatedName: record.nom_locuteur || record.relatedName || '',
    homeAddress: record.adresse || record.homeAddress || '',
    homeCity: record.ville || record.homeCity || '',
    homePostalCode: record.cp || record.homePostalCode || '',
    homePhone: record.tel || record.homePhone || '',
    homeFax: record.fax || record.homeFax || '',
    officeAddress: record.adresse_b || record.officeAddress || '',
    officeCity: record.ville_b || record.officeCity || '',
    officePostalCode: record.cp_b || record.officePostalCode || '',
    officePhone: record.tel_b || record.officePhone || '',
    officePhone2: record.tel_b2 || record.officePhone2 || '',
    officeFax: record.fax_b || record.officeFax || '',
    email: record.adresse_email || record.email || '',
    correspondence: record.Correspondant === 'D' ? 'Domicile' : record.Correspondant === 'B' ? 'Bureau' : (record.correspondence || ''),
    clientType: type === 'S' ? 'Societe' : type === 'P' ? 'Particulier' : (record.clientType || type || ''),
    taxExempt: record.Exonerer === 'O' || record.Exonerer === true || record.taxExempt === true,
    notes: record.observ || record.notes || '',
    createdAt: String(record.date_creation || record.createdAt || '').slice(0, 10),
    agencyCode: record.code_agence || record.agencyCode || '',
    companyCode: record.code_com ?? record.companyCode ?? '',
    companyContact: record.contact || record.companyContact || '',
    companyPhone: record.tel_contact || record.companyPhone || '',
    companyMobile: record.mobile || record.companyMobile || '',
    referenceCode: record.code ?? record.referenceCode ?? '',
  };
}
