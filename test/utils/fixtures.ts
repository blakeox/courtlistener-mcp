/**
 * CourtListener API fixture data for testing.
 * Matches TypeScript types from src/types.ts.
 */

import type { Opinion, OpinionCluster, Court, Judge, Docket } from '../../src/types.js';

// --- Opinions ---

export const opinions: Opinion[] = [
  {
    id: 1001,
    type: '010combined',
    author_str: 'Justice Roberts',
    joined_by_str: 'Justices Thomas, Alito',
    per_curiam: false,
    page_count: 42,
    extracted_by_ocr: false,
    plain_text:
      'The question presented is whether the Fourth Amendment permits law enforcement to conduct a warrantless search of a vehicle...',
    html: '<p>The question presented is whether the Fourth Amendment permits law enforcement...</p>',
    html_with_citations:
      '<p>The question presented is whether the Fourth Amendment permits law enforcement... See <a href="/opinion/999/">Terry v. Ohio</a>.</p>',
    download_url: 'https://storage.courtlistener.com/pdf/2023/01/15/mock-opinion-1001.pdf',
    absolute_url: '/opinion/1001/united-states-v-jones/',
    cluster: 2001,
  },
  {
    id: 1002,
    type: '020lead',
    author_str: 'Justice Sotomayor',
    per_curiam: false,
    page_count: 28,
    extracted_by_ocr: false,
    plain_text:
      'We hold that the Commerce Clause grants Congress the authority to regulate interstate economic activity...',
    absolute_url: '/opinion/1002/national-federation-v-sebelius/',
    cluster: 2002,
  },
  {
    id: 1003,
    type: '010combined',
    per_curiam: true,
    page_count: 5,
    extracted_by_ocr: false,
    plain_text:
      'The petition for writ of certiorari is granted. The judgment of the Court of Appeals is vacated and remanded.',
    absolute_url: '/opinion/1003/smith-v-maryland/',
    cluster: 2003,
  },
  {
    id: 1004,
    type: '030concurrence',
    author_str: 'Justice Kagan',
    joined_by_str: 'Justice Breyer',
    per_curiam: false,
    page_count: 15,
    extracted_by_ocr: true,
    plain_text:
      'I join the opinion of the Court in full but write separately to emphasize the limits of our holding...',
    absolute_url: '/opinion/1004/carpenter-v-united-states/',
    cluster: 2004,
  },
  {
    id: 1005,
    type: '040dissent',
    author_str: 'Justice Gorsuch',
    per_curiam: false,
    page_count: 30,
    extracted_by_ocr: false,
    plain_text:
      'The Court today extends the exclusionary rule far beyond its original scope. I respectfully dissent.',
    absolute_url: '/opinion/1005/miranda-v-arizona/',
    cluster: 2005,
  },
];

// --- Opinion Clusters ---

export const clusters: OpinionCluster[] = [
  {
    id: 2001,
    case_name: 'United States v. Jones',
    case_name_short: 'Jones',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_filed: '2012-01-23',
    citation_count: 1523,
    precedential_status: 'Published',
    federal_cite_one: '565 U.S. 400',
    absolute_url: '/opinion/2001/united-states-v-jones/',
    summary:
      'The Government\'s attachment of a GPS device to a vehicle and use of that device to monitor the vehicle\'s movements constitutes a "search" within the meaning of the Fourth Amendment.',
  },
  {
    id: 2002,
    case_name: 'National Federation of Independent Business v. Sebelius',
    case_name_short: 'NFIB v. Sebelius',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_filed: '2012-06-28',
    citation_count: 2841,
    precedential_status: 'Published',
    federal_cite_one: '567 U.S. 519',
    absolute_url: '/opinion/2002/nfib-v-sebelius/',
    summary:
      "The individual mandate of the Affordable Care Act is a valid exercise of Congress's taxing power.",
  },
  {
    id: 2003,
    case_name: 'Smith v. Maryland',
    case_name_short: 'Smith',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_filed: '1979-06-20',
    citation_count: 3102,
    precedential_status: 'Published',
    federal_cite_one: '442 U.S. 735',
    absolute_url: '/opinion/2003/smith-v-maryland/',
    summary:
      'A person has no legitimate expectation of privacy in information voluntarily turned over to third parties.',
  },
  {
    id: 2004,
    case_name: 'Carpenter v. United States',
    case_name_short: 'Carpenter',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_filed: '2018-06-22',
    citation_count: 987,
    precedential_status: 'Published',
    federal_cite_one: '585 U.S. 296',
    absolute_url: '/opinion/2004/carpenter-v-united-states/',
    summary:
      "The Government's acquisition of cell-site location information is a Fourth Amendment search requiring a warrant.",
  },
  {
    id: 2005,
    case_name: 'Miranda v. Arizona',
    case_name_short: 'Miranda',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_filed: '1966-06-13',
    citation_count: 8521,
    precedential_status: 'Published',
    federal_cite_one: '384 U.S. 436',
    absolute_url: '/opinion/2005/miranda-v-arizona/',
    summary:
      'The prosecution may not use statements stemming from custodial interrogation unless procedural safeguards are employed.',
  },
];

// --- Courts ---

export const courts: Court[] = [
  {
    id: 'scotus',
    full_name: 'Supreme Court of the United States',
    short_name: 'SCOTUS',
    citation_string: 'U.S.',
    jurisdiction: 'F',
    in_use: true,
    has_opinion_scraper: true,
    has_oral_argument_scraper: true,
    start_date: '1789-01-01',
    url: 'https://www.supremecourt.gov/',
  },
  {
    id: 'ca9',
    full_name: 'United States Court of Appeals for the Ninth Circuit',
    short_name: 'Ninth Circuit',
    citation_string: 'F.',
    jurisdiction: 'F',
    in_use: true,
    has_opinion_scraper: true,
    has_oral_argument_scraper: true,
    start_date: '1891-03-03',
    url: 'https://www.ca9.uscourts.gov/',
  },
  {
    id: 'ca2',
    full_name: 'United States Court of Appeals for the Second Circuit',
    short_name: 'Second Circuit',
    citation_string: 'F.',
    jurisdiction: 'F',
    in_use: true,
    has_opinion_scraper: true,
    has_oral_argument_scraper: false,
    start_date: '1891-03-03',
    url: 'https://www.ca2.uscourts.gov/',
  },
  {
    id: 'nysd',
    full_name: 'United States District Court for the Southern District of New York',
    short_name: 'S.D.N.Y.',
    citation_string: 'F. Supp.',
    jurisdiction: 'FD',
    in_use: true,
    has_opinion_scraper: false,
    has_oral_argument_scraper: false,
    start_date: '1789-09-24',
    url: 'https://www.nysd.uscourts.gov/',
  },
];

// --- Judges ---

export const judges: Judge[] = [
  {
    id: 3001,
    name_first: 'John',
    name_last: 'Roberts',
    name_middle: 'G.',
    name_suffix: 'Jr.',
    date_created: '2005-09-29T00:00:00Z',
    date_modified: '2024-01-15T12:00:00Z',
    gender: 'Male',
    slug: 'john-g-roberts-jr',
    date_start: '2005-09-29',
    how_selected: 'e_pres',
    political_affiliations: [],
    positions: [],
    educations: [],
    aba_ratings: [],
    sources: [],
  },
  {
    id: 3002,
    name_first: 'Sonia',
    name_last: 'Sotomayor',
    date_created: '2009-08-08T00:00:00Z',
    date_modified: '2024-01-15T12:00:00Z',
    gender: 'Female',
    slug: 'sonia-sotomayor',
    date_start: '2009-08-08',
    how_selected: 'e_pres',
    political_affiliations: [],
    positions: [],
    educations: [],
    aba_ratings: [],
    sources: [],
  },
  {
    id: 3003,
    name_first: 'Elena',
    name_last: 'Kagan',
    date_created: '2010-08-07T00:00:00Z',
    date_modified: '2024-01-15T12:00:00Z',
    gender: 'Female',
    slug: 'elena-kagan',
    date_start: '2010-08-07',
    how_selected: 'e_pres',
    political_affiliations: [],
    positions: [],
    educations: [],
    aba_ratings: [],
    sources: [],
  },
];

// --- Dockets ---

export const dockets: Docket[] = [
  {
    id: 4001,
    docket_number: '10-1259',
    case_name: 'United States v. Jones',
    case_name_short: 'Jones',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_created: '2011-01-01T00:00:00Z',
    date_modified: '2012-01-23T00:00:00Z',
    date_filed: '2011-06-27',
    date_terminated: '2012-01-23',
    assigned_to_str: 'Chief Justice Roberts',
    nature_of_suit: 'Criminal',
    source: 'C',
    view_count: 15234,
    blocked: false,
  },
  {
    id: 4002,
    docket_number: '11-393',
    case_name: 'National Federation of Independent Business v. Sebelius',
    case_name_short: 'NFIB v. Sebelius',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_created: '2011-09-01T00:00:00Z',
    date_modified: '2012-06-28T00:00:00Z',
    date_filed: '2011-09-28',
    date_terminated: '2012-06-28',
    assigned_to_str: 'Chief Justice Roberts',
    nature_of_suit: 'Constitutional',
    source: 'C',
    view_count: 42891,
    blocked: false,
  },
  {
    id: 4003,
    docket_number: '16-402',
    case_name: 'Carpenter v. United States',
    case_name_short: 'Carpenter',
    court: 'https://www.courtlistener.com/api/rest/v4/courts/scotus/',
    date_created: '2017-01-01T00:00:00Z',
    date_modified: '2018-06-22T00:00:00Z',
    date_filed: '2017-06-05',
    date_terminated: '2018-06-22',
    assigned_to_str: 'Chief Justice Roberts',
    nature_of_suit: 'Criminal',
    source: 'C',
    view_count: 28437,
    blocked: false,
  },
];
