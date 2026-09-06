# Sports source evidence

The `.body` files in this directory are raw byte responses fetched from the
public source pages. Each response has a matching `.meta.json` file containing
the URL, fetch time, byte count, and SHA-256 digest. The body files are kept in
their original encoding and are not generated fixtures.

The SFC response fetched on 2026-09-06 contains fourteen `bet-tb-tr` rows. Its
source row 13 is `data-vs="昂热vs雷恩" data-bjpl=""`; the rendered odds cells
are `- - -`. The synchronizer therefore records SFC as failed and publishes an
empty SFC array. It does not substitute odds or promote the prior snapshot.
