Storage layouts, one file per contract, regenerated with `arc-forge inspect <c> storageLayout`.

What these are for: detecting slot drift between commits. A variable added above an existing one
moves every slot below it, and two tests read raw slots by index — `test_Pool_KeepsOneAdvancePerWord`
hardcodes slot 6 — so a silent renumbering would break them for a reason nobody could see.

What these do NOT show, verified rather than assumed: whether a struct behind a mapping is
packed. `mapping(bytes32 => Payment)` prints `Bytes 32` whether Payment occupies one word or two
— the two tables are byte-identical. Packing is proven by the slot-reading tests in
`contracts/test`, which settle first and then check where the flag landed and whether the next
slot is empty.

The JSON form of this output is unusable here: it carries `astId` and AST-derived type keys, so
adding an unrelated variable renumbers everything and the diff shouts on every commit.
