# DLM Paint Colors

Den Lille Malerfabrik's full paint palette: **8 families × 25 shades = 200 colors**.

Each row follows the canonical data model (see `dlm-colors-with-ncs.json` for the JSON source of truth):

| Field         | Type         | Example      |
|---------------|--------------|--------------|
| `handle`      | auto         | `dlm0203`    |
| `dlm_id`      | single line  | `DLM0203`    |
| `ncs_code`    | single line  | `S 2020-B`   |
| `name_da`     | single line  | `Havbrise`   |
| `display_hex` | color        | `#A3C1CE`    |
| `family`      | single line  | `Blues`      |

Within each family, codes `FF01`–`FF04` are the original hand-curated anchor shades; codes `FF05`–`FF25` are the
21 tonal expansions added 2026-05-12. NCS codes were sourced from a separate matching pass and are tracked in the JSON.

## 01 — Whites

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0101  | DLM0101  | Snehvid           | S 0300-N      | #FAFAFA     |
| dlm0102  | DLM0102  | Porcelæn          | S 0500-N      | #F5F0EB     |
| dlm0103  | DLM0103  | Kalkhvid          | S 1005-Y30R   | #EDE8E0     |
| dlm0104  | DLM0104  | Cremehvid         | S 1010-Y10R   | #F5EDD6     |
| dlm0105  | DLM0105  | Frost             | S 0300-N      | #F8F7F7     |
| dlm0106  | DLM0106  | Skumhvid          | S 0300-N      | #F7F4F3     |
| dlm0107  | DLM0107  | Mælkehvid         | S 0500-N      | #F6F2F0     |
| dlm0108  | DLM0108  | Pudderhvid        | S 1005-Y30R   | #F2EDE6     |
| dlm0109  | DLM0109  | Bomuld            | S 1005-Y30R   | #F0EBE4     |
| dlm0110  | DLM0110  | Lilje             | S 1010-Y10R   | #F4EBD2     |
| dlm0111  | DLM0111  | Hørvid            | S 1010-Y10R   | #F2E8CB     |
| dlm0112  | DLM0112  | Måneskin          | S 1010-Y10R   | #F1E6C7     |
| dlm0113  | DLM0113  | Perlemor          | S 1010-Y10R   | #F0E4C4     |
| dlm0114  | DLM0114  | Lærred            | S 1010-Y10R   | #EFE3C0     |
| dlm0115  | DLM0115  | Linned            | S 1010-Y10R   | #EEE1BD     |
| dlm0116  | DLM0116  | Champagne         | S 1020-Y10R   | #EBDEB6     |
| dlm0117  | DLM0117  | Pergament         | S 1020-Y10R   | #EADCB3     |
| dlm0118  | DLM0118  | Fløde             | S 1020-Y10R   | #E9DAAF     |
| dlm0119  | DLM0119  | Antikhvid         | S 1020-Y10R   | #E7D7A8     |
| dlm0120  | DLM0120  | Vanilje           | S 1020-Y10R   | #E5D5A5     |
| dlm0121  | DLM0121  | Marsipan          | S 1020-Y20R   | #E4D3A2     |
| dlm0122  | DLM0122  | Mandel            | S 2020-Y10R   | #E3D19E     |
| dlm0123  | DLM0123  | Tåge              | S 2020-Y10R   | #E2CF9B     |
| dlm0124  | DLM0124  | Daggry            | S 2020-Y10R   | #DFCC95     |
| dlm0125  | DLM0125  | Magnolia          | S 2020-Y10R   | #DECA91     |

## 02 — Blues

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0201  | DLM0201  | Isklar            | S 1005-B10G   | #E4EEF2     |
| dlm0202  | DLM0202  | Himmellys         | S 1010-B      | #C8DBE4     |
| dlm0203  | DLM0203  | Havbrise          | S 2010-B      | #A3C1CE     |
| dlm0204  | DLM0204  | Dybhav            | S 4030-B10G   | #5B8FA3     |
| dlm0205  | DLM0205  | Frostblå          | S 0300-N      | #F2F7F9     |
| dlm0206  | DLM0206  | Polarlys          | S 0505-B      | #EBF2F5     |
| dlm0207  | DLM0207  | Morgentåge        | S 1005-B      | #DDE9EF     |
| dlm0208  | DLM0208  | Pudderblå         | S 1005-B      | #CFE0E8     |
| dlm0209  | DLM0209  | Sommerhimmel      | S 1010-B      | #C2D7E1     |
| dlm0210  | DLM0210  | Skyblå            | S 2010-B10G   | #BBD2DD     |
| dlm0211  | DLM0211  | Akvamarin         | S 2010-B10G   | #B5CED9     |
| dlm0212  | DLM0212  | Lagune            | S 2010-B      | #AFC9D5     |
| dlm0213  | DLM0213  | Søblå             | S 3010-B10G   | #9BBCCA     |
| dlm0214  | DLM0214  | Vandblå           | S 3010-B10G   | #95B7C6     |
| dlm0215  | DLM0215  | Tidevand          | S 3020-B10G   | #8EB3C2     |
| dlm0216  | DLM0216  | Aftenhav          | S 3020-B10G   | #88AEBE     |
| dlm0217  | DLM0217  | Skumring          | S 3020-B10G   | #81AABB     |
| dlm0218  | DLM0218  | Stjerneblå        | S 3030-B10G   | #75A1B3     |
| dlm0219  | DLM0219  | Nordlys           | S 3030-B10G   | #6E9DAF     |
| dlm0220  | DLM0220  | Saphir            | S 4020-B10G   | #6898AB     |
| dlm0221  | DLM0221  | Petroleum         | S 4030-B10G   | #6194A7     |
| dlm0222  | DLM0222  | Marineblå         | S 4030-B10G   | #58899C     |
| dlm0223  | DLM0223  | Indigo            | S 5030-B10G   | #527D8D     |
| dlm0224  | DLM0224  | Midnatsblå        | S 5030-B10G   | #4F7786     |
| dlm0225  | DLM0225  | Klippeblå         | S 5030-B10G   | #4C717F     |

## 03 — Greys

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0301  | DLM0301  | Sølvtåge          | S 2000-N      | #D6D8D6     |
| dlm0302  | DLM0302  | Drivsten          | S 3005-Y20R   | #B8B5AE     |
| dlm0303  | DLM0303  | Granitgrå         | S 5005-G90Y   | #908D86     |
| dlm0304  | DLM0304  | Skifergrå         | S 6000-N      | #6B6B6B     |
| dlm0305  | DLM0305  | Perlegrå          | S 1000-N      | #E0E2E0     |
| dlm0306  | DLM0306  | Asketåge          | S 1000-N      | #DBDDDB     |
| dlm0307  | DLM0307  | Duegrå            | S 2000-N      | #D1D4D1     |
| dlm0308  | DLM0308  | Tinngrå           | S 2000-N      | #C8CBC6     |
| dlm0309  | DLM0309  | Måneaske          | S 2000-N      | #C4C6C0     |
| dlm0310  | DLM0310  | Stensand          | S 3005-G80Y   | #C1C2BB     |
| dlm0311  | DLM0311  | Cementgrå         | S 3005-G80Y   | #BDBDB5     |
| dlm0312  | DLM0312  | Flintegrå         | S 3005-Y30R   | #B4B1AA     |
| dlm0313  | DLM0313  | Mosgrå            | S 4005-Y10R   | #ABA7A0     |
| dlm0314  | DLM0314  | Tinplade          | S 4005-Y20R   | #A6A29B     |
| dlm0315  | DLM0315  | Bly               | S 4005-Y20R   | #A19D96     |
| dlm0316  | DLM0316  | Stormvejr         | S 4005-Y30R   | #9C9891     |
| dlm0317  | DLM0317  | Skygge            | S 4005-Y30R   | #97938C     |
| dlm0318  | DLM0318  | Røggrå            | S 5005-Y30R   | #86837F     |
| dlm0319  | DLM0319  | Klippe            | S 5005-Y50R   | #817D7A     |
| dlm0320  | DLM0320  | Tordensky         | S 5000-N      | #7B7876     |
| dlm0321  | DLM0321  | Skorstensgrå      | S 5000-N      | #757372     |
| dlm0322  | DLM0322  | Jerngrå           | S 6000-N      | #6F6E6E     |
| dlm0323  | DLM0323  | Antrasit          | S 6000-N      | #606060     |
| dlm0324  | DLM0324  | Vulkangrå         | S 6000-N      | #5B5B5B     |
| dlm0325  | DLM0325  | Kullgrå           | S 7000-N      | #565656     |

## 04 — Greens

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0401  | DLM0401  | Morgendug         | S 1005-G30Y   | #E2EBE0     |
| dlm0402  | DLM0402  | Mynte             | S 2010-G20Y   | #C5D9C2     |
| dlm0403  | DLM0403  | Salvie            | S 3010-G20Y   | #A3B5A0     |
| dlm0404  | DLM0404  | Skovdybde         | S 5010-G10Y   | #6B7F68     |
| dlm0405  | DLM0405  | Eng               | S 1005-G90Y   | #EEF3EC     |
| dlm0406  | DLM0406  | Pistacie          | S 1005-G60Y   | #E8EFE6     |
| dlm0407  | DLM0407  | Linde             | S 1005-G20Y   | #DBE7D9     |
| dlm0408  | DLM0408  | Bambusgrøn        | S 2005-G10Y   | #CFDFCC     |
| dlm0409  | DLM0409  | Birkeløv          | S 2005-G10Y   | #C8DBC5     |
| dlm0410  | DLM0410  | Kløver            | S 2010-G20Y   | #C2D7BF     |
| dlm0411  | DLM0411  | Eukalyptus        | S 2010-G20Y   | #B8CCB4     |
| dlm0412  | DLM0412  | Selleri           | S 3010-G20Y   | #B2C7AF     |
| dlm0413  | DLM0413  | Æbleskind         | S 3010-G20Y   | #ADC1AA     |
| dlm0414  | DLM0414  | Lyngblad          | S 3010-G20Y   | #A9BCA5     |
| dlm0415  | DLM0415  | Bregne            | S 3010-G20Y   | #9EB19B     |
| dlm0416  | DLM0416  | Oliven            | S 4010-G20Y   | #93A790     |
| dlm0417  | DLM0417  | Tang              | S 4010-G20Y   | #8EA28A     |
| dlm0418  | DLM0418  | Mosgrøn           | S 4010-G10Y   | #889D85     |
| dlm0419  | DLM0419  | Cypres            | S 4010-G10Y   | #7D9479     |
| dlm0420  | DLM0420  | Fyrretræ          | S 5010-G10Y   | #778F74     |
| dlm0421  | DLM0421  | Skovsø            | S 5010-G10Y   | #73896F     |
| dlm0422  | DLM0422  | Granskygge        | S 5010-G10Y   | #6E836B     |
| dlm0423  | DLM0423  | Mørkmos           | S 6010-G10Y   | #657762     |
| dlm0424  | DLM0424  | Tundra            | S 6010-G10Y   | #5B6A59     |
| dlm0425  | DLM0425  | Mørkbregne        | S 6010-G10Y   | #566454     |

## 05 — Warm Neutrals

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0501  | DLM0501  | Elfenben          | S 1005-Y30R   | #F2EBE0     |
| dlm0502  | DLM0502  | Havremel          | S 1010-Y30R   | #E8DCC8     |
| dlm0503  | DLM0503  | Nougat            | S 2010-Y30R   | #CDBA9E     |
| dlm0504  | DLM0504  | Valnød            | S 5020-Y40R   | #8B7355     |
| dlm0505  | DLM0505  | Hvedemel          | S 0500-N      | #F8F4EE     |
| dlm0506  | DLM0506  | Vaniljecreme      | S 1005-Y30R   | #F5EFE7     |
| dlm0507  | DLM0507  | Rugmel            | S 1005-Y30R   | #EEE5D7     |
| dlm0508  | DLM0508  | Mandelmel         | S 1010-Y30R   | #E4D7C1     |
| dlm0509  | DLM0509  | Halm              | S 2010-Y30R   | #E0D1BA     |
| dlm0510  | DLM0510  | Hessian           | S 2010-Y30R   | #DCCCB3     |
| dlm0511  | DLM0511  | Hampegul          | S 2010-Y30R   | #D7C6AC     |
| dlm0512  | DLM0512  | Lærke             | S 2010-Y30R   | #D3C1A6     |
| dlm0513  | DLM0513  | Birk              | S 3020-Y20R   | #C6B192     |
| dlm0514  | DLM0514  | Honning           | S 3020-Y30R   | #C1AB8C     |
| dlm0515  | DLM0515  | Honningkage       | S 3020-Y30R   | #BDA685     |
| dlm0516  | DLM0516  | Kaffefløde        | S 3020-Y30R   | #B8A07F     |
| dlm0517  | DLM0517  | Sahara            | S 3020-Y30R   | #B49B78     |
| dlm0518  | DLM0518  | Skind             | S 4020-Y30R   | #AA8F6B     |
| dlm0519  | DLM0519  | Kanel             | S 4030-Y30R   | #A68A65     |
| dlm0520  | DLM0520  | Muskat            | S 4030-Y30R   | #A1845F     |
| dlm0521  | DLM0521  | Mocca             | S 4030-Y40R   | #9A7E5C     |
| dlm0522  | DLM0522  | Tørv              | S 5020-Y30R   | #927858     |
| dlm0523  | DLM0523  | Mørkkanel         | S 5020-Y40R   | #7B674E     |
| dlm0524  | DLM0524  | Kakaopulver       | S 6020-Y30R   | #74614A     |
| dlm0525  | DLM0525  | Espresso          | S 6020-Y40R   | #6D5C47     |

## 06 — Yellows / Sands

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0601  | DLM0601  | Strandlys         | S 1005-Y20R   | #F0E8D8     |
| dlm0602  | DLM0602  | Klitsand          | S 2010-Y20R   | #DDD0B5     |
| dlm0603  | DLM0603  | Ravgul            | S 3050-Y10R   | #C8A84E     |
| dlm0604  | DLM0604  | Karamel           | S 4040-Y40R   | #A67B4B     |
| dlm0605  | DLM0605  | Sommersand        | S 0505-Y20R   | #F6F1E7     |
| dlm0606  | DLM0606  | Strandlinje       | S 1005-Y20R   | #F3ECDF     |
| dlm0607  | DLM0607  | Sandklit          | S 1005-Y20R   | #EDE4D1     |
| dlm0608  | DLM0608  | Hvedekorn         | S 1010-Y20R   | #E6DBC4     |
| dlm0609  | DLM0609  | Ørkensand         | S 2010-Y20R   | #E2D6BD     |
| dlm0610  | DLM0610  | Smør              | S 2010-Y20R   | #DBCDB0     |
| dlm0611  | DLM0611  | Aksgul            | S 2010-Y20R   | #D9CAA8     |
| dlm0612  | DLM0612  | Æbleguld          | S 2020-Y20R   | #D7C6A0     |
| dlm0613  | DLM0613  | Solskin           | S 2020-Y20R   | #D3BF90     |
| dlm0614  | DLM0614  | Citron            | S 2020-Y20R   | #D1BB88     |
| dlm0615  | DLM0615  | Solsikke          | S 2030-Y20R   | #CFB87F     |
| dlm0616  | DLM0616  | Solgul            | S 2030-Y20R   | #CEB577     |
| dlm0617  | DLM0617  | Honninggul        | S 2030-Y20R   | #CCB26E     |
| dlm0618  | DLM0618  | Ravstøv           | S 2040-Y20R   | #CAAC5C     |
| dlm0619  | DLM0619  | Aprikos           | S 3040-Y10R   | #C9A953     |
| dlm0620  | DLM0620  | Sennep            | S 3050-Y20R   | #BE964A     |
| dlm0621  | DLM0621  | Sennepskorn       | S 3050-Y30R   | #B58A49     |
| dlm0622  | DLM0622  | Guldokker         | S 4040-Y40R   | #A07749     |
| dlm0623  | DLM0623  | Bronzegul         | S 5030-Y40R   | #906D45     |
| dlm0624  | DLM0624  | Møntguld          | S 5030-Y40R   | #886743     |
| dlm0625  | DLM0625  | Okkerbrun         | S 5030-Y40R   | #806240     |

## 07 — Pinks / Coppers

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0701  | DLM0701  | Rosendug          | S 1005-Y70R   | #F0DDD8     |
| dlm0702  | DLM0702  | Solnedgang        | S 2020-Y60R   | #E0A890     |
| dlm0703  | DLM0703  | Kobber            | S 3050-Y50R   | #B87548     |
| dlm0704  | DLM0704  | Terracotta        | S 3050-Y60R   | #C06840     |
| dlm0705  | DLM0705  | Skumrosa          | S 0505-Y60R   | #F6EAE7     |
| dlm0706  | DLM0706  | Pudderrosa        | S 1005-Y60R   | #F3E4E0     |
| dlm0707  | DLM0707  | Magnoliarosa      | S 1005-Y70R   | #EED8D1     |
| dlm0708  | DLM0708  | Kirsebærblomst    | S 1010-Y70R   | #EACCC2     |
| dlm0709  | DLM0709  | Lyserosa          | S 1010-Y70R   | #E8C6BA     |
| dlm0710  | DLM0710  | Antikrosa         | S 1010-Y70R   | #E6C0B2     |
| dlm0711  | DLM0711  | Rosenkind         | S 2010-Y70R   | #E3B4A2     |
| dlm0712  | DLM0712  | Tørket Rose       | S 2020-Y60R   | #E1AF9A     |
| dlm0713  | DLM0713  | Pæonrosa          | S 2020-Y60R   | #DEA38A     |
| dlm0714  | DLM0714  | Fersken           | S 2020-Y70R   | #DB9E83     |
| dlm0715  | DLM0715  | Lakserosa         | S 2020-Y70R   | #D9987C     |
| dlm0716  | DLM0716  | Korall            | S 2030-Y60R   | #D38D6E     |
| dlm0717  | DLM0717  | Aprikosflamme     | S 2030-Y70R   | #D18767     |
| dlm0718  | DLM0718  | Mandarin          | S 2040-Y60R   | #CE8260     |
| dlm0719  | DLM0719  | Kobberglans       | S 3040-Y60R   | #C87752     |
| dlm0720  | DLM0720  | Henna             | S 3040-Y60R   | #C5714C     |
| dlm0721  | DLM0721  | Klipperose        | S 3040-Y60R   | #C26C45     |
| dlm0722  | DLM0722  | Lerokker          | S 4040-Y50R   | #AE7046     |
| dlm0723  | DLM0723  | Brændt Kobber     | S 4040-Y50R   | #A66B44     |
| dlm0724  | DLM0724  | Rust              | S 4040-Y60R   | #966341     |
| dlm0725  | DLM0725  | Mørkkobber        | S 5040-Y50R   | #8E5F3F     |

## 08 — Reds / Browns

| handle   | dlm_id   | name_da           | ncs_code      | display_hex |
|----------|----------|-------------------|---------------|-------------|
| dlm0801  | DLM0801  | Rødler            | S 3040-Y80R   | #B85C42     |
| dlm0802  | DLM0802  | Murstensrød       | S 4050-Y80R   | #9B4332     |
| dlm0803  | DLM0803  | Kastanje          | S 6040-Y80R   | #6E3428     |
| dlm0804  | DLM0804  | Mørk Jord         | S 7030-Y80R   | #4A2820     |
| dlm0805  | DLM0805  | Glødende Mursten  | S 3040-Y70R   | #C0684F     |
| dlm0806  | DLM0806  | Karminrød         | S 3040-Y70R   | #BE634A     |
| dlm0807  | DLM0807  | Tørret Mursten    | S 3040-Y70R   | #BC5F44     |
| dlm0808  | DLM0808  | Granatæblerød     | S 3050-Y80R   | #AF543D     |
| dlm0809  | DLM0809  | Cognac            | S 4040-Y80R   | #AA503A     |
| dlm0810  | DLM0810  | Bordeaux          | S 4040-Y80R   | #A64C38     |
| dlm0811  | DLM0811  | Vinrød            | S 4040-Y80R   | #A14835     |
| dlm0812  | DLM0812  | Burgunder         | S 4050-Y80R   | #974231     |
| dlm0813  | DLM0813  | Mahogni           | S 5040-Y80R   | #8C3E2F     |
| dlm0814  | DLM0814  | Jordrød           | S 5040-Y80R   | #863C2E     |
| dlm0815  | DLM0815  | Egetræ            | S 5040-Y80R   | #803B2C     |
| dlm0816  | DLM0816  | Brændt Ler        | S 5040-Y80R   | #7B392B     |
| dlm0817  | DLM0817  | Whiskeybrun       | S 6040-Y80R   | #75372A     |
| dlm0818  | DLM0818  | Kobberbrun        | S 6040-Y80R   | #643126     |
| dlm0819  | DLM0819  | Tobaksbrun        | S 6040-Y80R   | #5E2F25     |
| dlm0820  | DLM0820  | Skovjord          | S 7030-Y80R   | #582D24     |
| dlm0821  | DLM0821  | Klippejord        | S 7030-Y80R   | #532B22     |
| dlm0822  | DLM0822  | Lædermørk         | S 7030-Y80R   | #4D2921     |
| dlm0823  | DLM0823  | Mørkebrun         | S 8020-Y90R   | #3D231D     |
| dlm0824  | DLM0824  | Bækjord           | S 8020-Y90R   | #37201B     |
| dlm0825  | DLM0825  | Sortkaffe         | S 8020-Y90R   | #321E19     |
