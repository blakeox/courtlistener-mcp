#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Query Builders (Phase 4)
 * Tests type-safe fluent query builder functionality
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

const {
  OpinionQueryBuilder,
  CaseQueryBuilder,
  DocketQueryBuilder,
  JudgeQueryBuilder,
  QueryBuilder,
} = await import('../../dist/infrastructure/query-builder.js');

describe('OpinionQueryBuilder', () => {
  it('builds simple query', () => {
    const params = new OpinionQueryBuilder()
      .query('privacy rights')
      .build();
    
    assert.strictEqual(params.q, 'privacy rights');
  });

  it('builds complex query with chaining', () => {
    const params = new OpinionQueryBuilder()
      .query('privacy rights')
      .court('scotus')
      .dateRange('2020-01-01', '2024-01-01')
      .paginate(2, 50)
      .orderBy('date_filed')
      .build();
    
    assert.strictEqual(params.q, 'privacy rights');
    assert.strictEqual(params.court, 'scotus');
    assert.strictEqual(params.date_filed_after, '2020-01-01');
    assert.strictEqual(params.date_filed_before, '2024-01-01');
    assert.strictEqual(params.page, 2);
    assert.strictEqual(params.page_size, 50);
    assert.strictEqual(params.order_by, 'date_filed');
  });

  it('builds query with judge filter', () => {
    const params = new OpinionQueryBuilder()
      .judge('Roberts')
      .build();
    
    assert.strictEqual(params.judge, 'Roberts');
  });

  it('builds query with citation', () => {
    const params = new OpinionQueryBuilder()
      .citation('410 U.S. 113')
      .build();
    
    assert.strictEqual(params.citation, '410 U.S. 113');
  });

  it('builds query with case name', () => {
    const params = new OpinionQueryBuilder()
      .caseName('Roe v. Wade')
      .build();
    
    assert.strictEqual(params.case_name, 'Roe v. Wade');
  });

  it('builds query with precedential status', () => {
    const params = new OpinionQueryBuilder()
      .precedentialStatus('Published')
      .build();
    
    assert.strictEqual(params.precedential_status, 'Published');
  });

  it('builds query with citation count range', () => {
    const params = new OpinionQueryBuilder()
      .citationCount(10, 100)
      .build();
    
    assert.strictEqual(params.cited_gt, 10);
    assert.strictEqual(params.cited_lt, 100);
  });

  it('resets builder state', () => {
    const builder = new OpinionQueryBuilder();
    builder.query('test').court('scotus');
    builder.reset();
    const params = builder.build();
    
    assert.strictEqual(Object.keys(params).length, 0);
  });
});

describe('CaseQueryBuilder', () => {
  it('builds case search query', () => {
    const params = new CaseQueryBuilder()
      .query('constitutional law')
      .court('ca9')
      .paginate(1, 20)
      .build();
    
    assert.strictEqual(params.q, 'constitutional law');
    assert.strictEqual(params.court, 'ca9');
    assert.strictEqual(params.page, 1);
    assert.strictEqual(params.page_size, 20);
  });

  it('builds query with docket number', () => {
    const params = new CaseQueryBuilder()
      .docketNumber('20-cv-1234')
      .build();
    
    assert.strictEqual(params.docket_number, '20-cv-1234');
  });
});

describe('DocketQueryBuilder', () => {
  it('builds docket search query', () => {
    const params = new DocketQueryBuilder()
      .caseName('Smith v. Jones')
      .jurisdiction('FB')
      .build();
    
    assert.strictEqual(params.case_name, 'Smith v. Jones');
    assert.strictEqual(params.court__jurisdiction, 'FB');
  });

  it('builds query with nature of suit', () => {
    const params = new DocketQueryBuilder()
      .natureOfSuit('Contract')
      .status('pending')
      .build();
    
    assert.strictEqual(params.nature_of_suit, 'Contract');
    assert.strictEqual(params.status, 'pending');
  });
});

describe('JudgeQueryBuilder', () => {
  it('builds judge search query', () => {
    const params = new JudgeQueryBuilder()
      .name('Sotomayor')
      .active(true)
      .build();
    
    assert.strictEqual(params.name, 'Sotomayor');
    assert.strictEqual(params.active, true);
  });

  it('builds query with school filter', () => {
    const params = new JudgeQueryBuilder()
      .school('Harvard')
      .appointer('Obama')
      .appointmentYear(2009)
      .build();
    
    assert.strictEqual(params.school, 'Harvard');
    assert.strictEqual(params.appointer, 'Obama');
    assert.strictEqual(params.appointment_year, 2009);
  });
});

describe('QueryBuilderFactory', () => {
  it('creates opinion builder', () => {
    const builder = QueryBuilder.opinions();
    assert.ok(builder instanceof OpinionQueryBuilder);
  });

  it('creates case builder', () => {
    const builder = QueryBuilder.cases();
    assert.ok(builder instanceof CaseQueryBuilder);
  });

  it('creates docket builder', () => {
    const builder = QueryBuilder.dockets();
    assert.ok(builder instanceof DocketQueryBuilder);
  });

  it('creates judge builder', () => {
    const builder = QueryBuilder.judges();
    assert.ok(builder instanceof JudgeQueryBuilder);
  });
});

describe('Query Builder Integration', () => {
  it('builds complete search scenario', () => {
    // Realistic scenario: Search for recent Supreme Court privacy opinions
    const params = QueryBuilder.opinions()
      .query('fourth amendment privacy')
      .court('scotus')
      .dateRange('2020-01-01')
      .precedentialStatus('Published')
      .citationCount(5) // Highly cited
      .paginate(1, 25)
      .orderBy('date_filed')
      .build();
    
    assert.strictEqual(params.q, 'fourth amendment privacy');
    assert.strictEqual(params.court, 'scotus');
    assert.strictEqual(params.date_filed_after, '2020-01-01');
    assert.strictEqual(params.precedential_status, 'Published');
    assert.strictEqual(params.cited_gt, 5);
    assert.strictEqual(params.page, 1);
    assert.strictEqual(params.page_size, 25);
    assert.strictEqual(params.order_by, 'date_filed');
  });

  it('builds query with partial date range', () => {
    const params = QueryBuilder.opinions()
      .dateRange('2020-01-01') // Only after date
      .build();
    
    assert.strictEqual(params.date_filed_after, '2020-01-01');
    assert.strictEqual(params.date_filed_before, undefined);
  });
});

