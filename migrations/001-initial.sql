--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------
create table if not exists runs
(
    id         integer primary key,
    root_dir   varchar not null,
    project_id varchar not null,
    started    integer not null,
    finished   integer,
    run_name   varchar
);

create table if not exists test_outcomes
(
    id        integer primary key,
    run_id    integer not null,
    test_name varchar not null,
    occurred  integer not null,
    duration  real    not null,
    failures  integer not null,
    coverage  blob
);

create index test_occurred_idx on test_outcomes (occurred, test_name);

create view test_outcomes_with_run as
select test_outcomes.*, runs.root_dir, runs.project_id, runs.started, runs.finished, runs.run_name
from test_outcomes
         inner join runs on test_outcomes.run_id = runs.id;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

drop table runs;
drop table test_outcomes;
drop view test_outcomes_with_run;
