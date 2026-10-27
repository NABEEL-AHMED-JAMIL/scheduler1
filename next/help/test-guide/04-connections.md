---
id: qa-connections
title: "Test area 04: connections and API collections"
summary: Storage and database connections, API collections with secrets, tests, paging, versions and imports, data contracts, sources, and the addresses the console refuses.
section: Data in and build
who: Testers; as the administrator (A), with V and X for the access and isolation checks
where: Connections › Storage (/connections/storage); Connections › Databases (/connections/databases); Connections › API collections (/connections/api-collections); Connections › Data contracts (/connections/contracts); Connections › Sources (/connections/sources)
related: con-storage, con-databases, con-api-collections, con-api-test, con-api-versions, con-api-import, con-contracts, con-addresses, qa-guide
---
These checks cover how the workspace reaches data: storage connections, read-only database connections, API
collections (their sign-in, environments, tests, paging and versions), imports from Postman, data contracts and sources.
Secrets are never shown back, and addresses inside a private network are refused, whoever asks.

**Before you start:** a test bucket and keys for it (a sandbox or development bucket, never production), a read-only
test database user if your platform has a test database, a public keyless API to call (the examples use the public
FHIR sandbox `https://r4.smarthealthit.org`), and a small Postman v2.1 collection export.

Tested by ______ on ______

## Storage
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-04.01 | Add a storage connection | As A, **Connections › Storage** › **New storage connection**: **Provider**, **Name**, **Alias** `qa-test-s3`, bucket and keys; **Create** | The connection is listed **Active**; **Credentials** reads **Stored** | ☐ Pass ☐ Fail |
| QA-04.02 | Test it | Its menu › **Test connection** | **Last test** reads **OK** with the time; the **Tested OK** tile counts it | ☐ Pass ☐ Fail |
| QA-04.03 | The secret is never shown back | Open it with **Edit** | The secret key field is empty; saving with it empty keeps the stored key (test again: **OK**) | ☐ Pass ☐ Fail |
| QA-04.04 | A bad alias is refused | **New storage connection** with **Alias** `qa test/1` | Refused: letters, numbers, `.`, `_` and `-` only | ☐ Pass ☐ Fail |
| QA-04.05 | Wrong keys fail the test | Edit the connection with a wrong secret key; **Test connection** | **Last test** reads **Failed**; hovering says why; the **Failing** tile counts it. Put the right key back | ☐ Pass ☐ Fail |
| QA-04.06 | Switch a connection off | **Edit** › **Status** **Inactive** | It stays listed as inactive and is not counted **In service** | ☐ Pass ☐ Fail |
| QA-04.07 | The Storage tab is the administrators' | As V, go to `/connections/storage` | The page is refused | ☐ Pass ☐ Fail |

## Databases
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-04.08 | Add a read-only database connection | As A, **Connections › Databases** › **New connection**: **Host**, **Port**, **Database**, **User**, **TLS**, **Password**; **Test connection**; **Create** | The dialog says the test worked; the connection is listed; the password is never shown again (**Replace** / **Keep**) | ☐ Pass ☐ Fail |
| QA-04.09 | Only a reading query runs | **Connections › Sources** › **New source**, **Reads from** **Database**, query `DELETE FROM orders`; **Test connection**, **Preview** | Refused before it runs: one statement starting with `SELECT`, `WITH`, `VALUES` or `TABLE` | ☐ Pass ☐ Fail |
| QA-04.10 | A reading query previews | Change the query to `SELECT * FROM orders` (or a table you have); **Preview** | The first rows are shown, capped; nothing is written to the database | ☐ Pass ☐ Fail |

## API collections
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-04.11 | Make a collection | As A, **Connections › API collections** › **New collection**: **Name** `QA public APIs`, **Sensitivity** **Public**, **Default auth** **None**; **Create** | The collection opens on its **Overview**, version **v1** | ☐ Pass ☐ Fail |
| QA-04.12 | An environment with a secret | **New environment** `Sandbox`, **Default** ticked; variable `baseUrl` = `https://r4.smarthealthit.org`; variable `token` = `abc`, **Secret** ticked; **Create** | `token` shows **••• configured**; its value is never shown, even to A | ☐ Pass ☐ Fail |
| QA-04.13 | A plain credential is refused | **Add API**; on **Headers** add `Authorization` = `Bearer abc` (a plain value); **Save** | Refused: a credential must be a `{{variable}}` | ☐ Pass ☐ Fail |
| QA-04.14 | Add and test an API | **Add API**: **Method** GET, **URL** `{{baseUrl}}/Patient`; **Save & test** | The test line reads **OK**, `HTTP 200`, the time and size; **Body** shows the answer | ☐ Pass ☐ Fail |
| QA-04.15 | Paging | On its **Settings**, **Paging** **Next URL in the answer**, **Next URL at** `$.link[?(@.relation=='next')].url`, **Items at** `$.entry`, **Most pages** `3`; **Save & test** | The test line reads "N items over 3 pages" and says it stopped at the page cap with more to fetch | ☐ Pass ☐ Fail |
| QA-04.16 | A private address is blocked | Add an API with **URL** `http://192.168.1.40/fhir`; **Test** | **Blocked**: nothing is sent | ☐ Pass ☐ Fail |
| QA-04.17 | Each save is a version | Save the API again with a small change; open **History** | The collection is at the next version; **History** lists both, the newest **current** | ☐ Pass ☐ Fail |
| QA-04.18 | Pin a source to a version | **Connections › Sources** › **New source**, **Reads from** **API**: the collection, the API, the older **Version**; **Save**; then save the API once more | **Used by** on the collection shows the source pinned to the older version, with **behind** | ☐ Pass ☐ Fail |
| QA-04.19 | A used API cannot be deleted | Try to delete the API the source uses | Refused; the console lists what uses it and the version each one pinned | ☐ Pass ☐ Fail |
| QA-04.20 | Import a Postman collection | **Import**, **Postman**, pick the `.json` export; **Import** | The **Import report** counts **Imported**, **Converted**, **Needs a look** and **Skipped**; **Open collection** opens a new collection with **Source** Postman | ☐ Pass ☐ Fail |
| QA-04.21 | An import never changes an existing collection | Import the same file again | A second, separate collection is made; the first is unchanged | ☐ Pass ☐ Fail |

## Data contracts and sources
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-04.22 | Make a contract from a sample | As A, **Connections › Data contracts** › **New from sample**: **Name** `qa_lab_result`, paste `{"loinc":"2345-7","value":5.4,"result_id":"R1"}`; **Propose schema**; tick **Required** on all three; **Save v1** | The contract is listed with **Active** and **Latest** v1 | ☐ Pass ☐ Fail |
| QA-04.23 | A payload that breaks it | Open it; **Validate a payload**: `{"value":"high"}`; **Validate** | Each problem is listed by **Path**, **Rule** and **Message** (the missing `loinc` and `result_id`, `value` not a number); nothing is recorded | ☐ Pass ☐ Fail |
| QA-04.24 | A new version waits until activated | **New version from sample**, **Save version**; then **Activate** it | Before **Activate**, checks still use v1; after, v2 is active and v1 reads **Retired** | ☐ Pass ☐ Fail |
| QA-04.25 | What your pipelines read | **Connections › Sources** › **What your pipelines read** | Each place a pipeline reads is listed with **Kind** and **Read by**, each pipeline a link | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-04.26 | A viewer has no Connections | As V, look for **Connections** in the menu, then go to `/connections/api-collections` | Not in the menu; the address is refused | ☐ Pass ☐ Fail |
| QA-04.27 | Another workspace cannot see them | As X, open **Connections**: Storage, Databases, API collections, Data contracts | None of A's connections, collections or contracts is listed | ☐ Pass ☐ Fail |
| QA-04.28 | Another workspace cannot open one by its address | As A, copy the address of `QA public APIs`; as X, open it | The collection does not open for X; none of its APIs or variables is shown (not yet verified) | ☐ Pass ☐ Fail |

## Example
At Summit Valley the tester's test of **FHIR: patients** reads **OK**, `HTTP 200`, 100 items over four pages, and a test
against the hospital's own `http://192.168.1.40/fhir` reads **Blocked**. The `lab_result` contract refuses a result
without its LOINC code by path.
