# Option coverage: 10 and 100 player games

Games read: 233 from k10r, k10, k100, c25f. *clean* = every check passed; *timing only* = the only failed checks were number-timing checks (this laptop under load, see the six sigma report).

## play mode

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| auto12 | 76 | 66 | 6 | 4 |
| auto9 | 81 | 68 | 9 | 4 |
| host | 76 | 73 | 0 | 3 |

## audience / verification

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| emp-both | 40 | 37 | 1 | 2 |
| emp-id | 40 | 34 | 5 | 1 |
| everyone-both | 34 | 31 | 1 | 2 |
| everyone-id | 36 | 32 | 3 | 1 |
| list-mobile | 37 | 32 | 3 | 2 |
| open | 46 | 41 | 2 | 3 |

## tickets per person

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| 1 | 116 | 104 | 8 | 4 |
| 2 | 117 | 103 | 7 | 7 |

## prize set

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| early5#1,early5#2,top#1,top#2,full#1,full#2 | 53 | 47 | 3 | 3 |
| early5#1,top#1 | 67 | 61 | 5 | 1 |
| early5#1,top#1,mid#1,bot#1,corners#1,full#1 | 62 | 52 | 5 | 5 |
| star#1,corners#1,top#1,full#1 | 51 | 47 | 2 | 2 |

## tie rule

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| next | 154 | 135 | 8 | 11 |
| share | 79 | 72 | 7 | 0 |

## brand breaks

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| no | 161 | 145 | 14 | 2 |
| yes | 72 | 62 | 1 | 9 |

## rounds

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| 1 | 222 | 197 | 14 | 11 |
| 2 | 11 | 10 | 1 | 0 |

## claim behaviour

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| mixed | 227 | 202 | 14 | 11 |
| none | 6 | 5 | 1 | 0 |

## events

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| - | 107 | 97 | 7 | 3 |
| bogey | 10 | 7 | 1 | 2 |
| bogey+end | 2 | 1 | 0 | 1 |
| end | 4 | 2 | 1 | 1 |
| late | 29 | 25 | 3 | 1 |
| late+bogey | 2 | 2 | 0 | 0 |
| late+offline | 5 | 5 | 0 | 0 |
| late+reload | 6 | 6 | 0 | 0 |
| late+reload+offline | 1 | 1 | 0 | 0 |
| late+slow | 2 | 2 | 0 | 0 |
| offline | 18 | 16 | 1 | 1 |
| offline+bogey | 2 | 2 | 0 | 0 |
| offline+slow | 2 | 2 | 0 | 0 |
| reload | 24 | 23 | 0 | 1 |
| reload+bogey | 2 | 2 | 0 | 0 |
| reload+offline | 4 | 4 | 0 | 0 |
| reload+slow | 2 | 2 | 0 | 0 |
| slow | 11 | 8 | 2 | 1 |

## payment path

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| free demo | 123 | 118 | 1 | 4 |
| link | 55 | 43 | 9 | 3 |
| org | 55 | 46 | 5 | 4 |

## mode x audience

| value | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| auto12 x emp-both | 13 | 12 | 0 | 1 |
| auto12 x emp-id | 13 | 10 | 3 | 0 |
| auto12 x everyone-both | 11 | 10 | 0 | 1 |
| auto12 x everyone-id | 12 | 11 | 0 | 1 |
| auto12 x list-mobile | 13 | 11 | 1 | 1 |
| auto12 x open | 14 | 12 | 2 | 0 |
| auto9 x emp-both | 14 | 13 | 1 | 0 |
| auto9 x emp-id | 14 | 11 | 2 | 1 |
| auto9 x everyone-both | 12 | 10 | 1 | 1 |
| auto9 x everyone-id | 13 | 10 | 3 | 0 |
| auto9 x list-mobile | 10 | 7 | 2 | 1 |
| auto9 x open | 18 | 17 | 0 | 1 |
| host x emp-both | 13 | 12 | 0 | 1 |
| host x emp-id | 13 | 13 | 0 | 0 |
| host x everyone-both | 11 | 11 | 0 | 0 |
| host x everyone-id | 11 | 11 | 0 | 0 |
| host x list-mobile | 14 | 14 | 0 | 0 |
| host x open | 14 | 12 | 0 | 2 |

## By game size

| size | games | clean | timing only | other failure |
|---|---:|---:|---:|---:|
| 10 (demo) | 123 | 118 | 1 | 4 |
| 100 | 110 | 89 | 14 | 7 |
