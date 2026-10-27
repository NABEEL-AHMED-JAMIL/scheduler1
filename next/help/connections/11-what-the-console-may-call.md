---
id: con-addresses
title: What the console may call
summary: APIs, storage endpoints, paging links and webhooks must be public addresses; private and internal ones are refused, and why.
section: Good to know
who: Everyone who sets up connections
where: Connections › API collections (/connections/api-collections); Connections › Storage (/connections/storage)
related: con-api-test, con-api-paging, con-storage, con-databases
---
The console calls out to other systems for you: an API in a collection, a storage endpoint, the next page of a paged
answer, a webhook. Each of those calls goes to a **public** address on the internet. An address inside a private
network is refused, whoever asks for it.

## What is refused
- **Private network addresses**, such as `10.x.x.x`, `172.16.x.x` to `172.31.x.x` and `192.168.x.x`.
- **Loopback**, such as `localhost` and `127.0.0.1`.
- **Link-local** addresses.
- **Cloud metadata** addresses, the ones a cloud server asks about itself. These are never allowed.

The check is made on the address a name leads to, not only on the name you typed: a public-looking host name that
resolves to a private address is refused too. It is made again on every call, not only when you save.

## Where you see it
- **Test** on an API says **Blocked**, and nothing is sent. See [Test a request](#con-api-test).
- A pipeline step that would call such an address fails instead of calling it.
- A storage connection whose **Endpoint** is private does not pass **Test connection**.
- A webhook's address must be `https` and public; a private one is refused when you save it and again at every
  delivery.

## Paging and other hosts
A paged API's next-page address stays on the first request's host. If the API hands out later pages from another
host, name that host in **Other hosts** on the API's **Settings**. Calls there are sent without this API's
credentials, so a link in an answer can never carry your secrets somewhere else. See
[Page through results](#con-api-paging).

## Why
Your workspace shares the platform with others. If the console would call any address it was given, someone could
point an API or a storage endpoint at the platform's own internal services, or at another organisation's systems
behind the same network, and read what they answer. Refusing private and metadata addresses closes that door for
everyone, your workspace included.

> **Note:** Your own systems on a private network are not reachable this way. Expose what a pipeline needs through a
> public, secured address (with TLS and its own sign-in), or ask your account team about connecting a private system.

## Example
Summit Valley's public health APIs (FHIR, openFDA, RxNorm, ClinicalTrials.gov) are all public and keyless, so they pass.
A test against `http://192.168.1.40/fhir`, the hospital's own server, says **Blocked**; the integration team publishes
the endpoint through the hospital's API gateway instead and the collection points there.
