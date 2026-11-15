import { clientQueryRank, rankClients } from './clientApi';

const client = (code, lastName, firstName) => ({ clientCode: code, lastName, firstName, nom_client: `${lastName} ${firstName}` });
const clients = [
  client('4355', 'BENABDENNOUR', 'MOHAMED'), client('100', 'BEN ABDENNOUR', 'SAMI'), client('101', 'ABDENNOUR', 'ALI'),
  client('102', 'BEN ALI', 'WALID'), client('103', 'TRABELSI', 'NOUR'),
];
const names = (query) => rankClients(clients, query).map((item) => item.clientCode);

test('a word still finds the names it begins, the whole words first', () => {
  expect(names('ben')).toEqual(['100', '102', '4355']);
  expect(clientQueryRank(clients[3], 'ben ali')).toBe(0);
});

test('similar names: "abdenour" finds every Abdennour, joined or not, with one n or two', () => {
  expect(names('abdenour')).toEqual(['101', '100', '4355']);
  expect(names('abdennour')).toEqual(['101', '100', '4355']);
  expect(names('Ben Abdennour')).toEqual(['100', '4355']);
  expect(names('benabdenour')).toEqual(['100', '4355']);
});

test('one letter wrong in a long word is still found, after the closer matches', () => {
  expect(names('abdenor')).toEqual(['101', '100', '4355']);
  expect(names('xyz')).toEqual([]);
  expect(names('4355')).toEqual(['4355']);
});
