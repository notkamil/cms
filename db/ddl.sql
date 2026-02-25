-- ============================================================
-- DDL: Coworking Management System (SYSENG variant)
-- PostgreSQL 16
-- ============================================================

-- ============================================================
-- ENUM-types
-- ============================================================

-- Для существующей БД: ALTER TYPE space_status ADD VALUE 'disabled';
CREATE TYPE space_status        AS ENUM ('available', 'occupied', 'maintenance', 'disabled');
-- tariff_type: fixed (фикс, одно место), hourly (почасовой), package (пакет, пул пространств)
-- Если в БД уже был 'monthly', выполните: ALTER TYPE tariff_type RENAME VALUE 'monthly' TO 'fixed';
CREATE TYPE tariff_type         AS ENUM ('fixed', 'hourly', 'package');
CREATE TYPE booking_type        AS ENUM ('one_time', 'subscription');
CREATE TYPE booking_status      AS ENUM ('confirmed', 'cancelled', 'completed');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE transaction_type    AS ENUM ('deposit', 'payment', 'refund', 'bonus', 'withdrawal');
CREATE TYPE staff_role          AS ENUM ('superadmin', 'admin', 'staff', 'inactive');

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE SpaceTypes (
    SpaceTypeId INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name        VARCHAR(24) NOT NULL UNIQUE,
    Description TEXT        NOT NULL DEFAULT ''
);

CREATE TABLE Amenities (
    AmenityId   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name        VARCHAR(24) NOT NULL UNIQUE,
    Description TEXT        NOT NULL DEFAULT ''
);

CREATE TABLE Staff (
    StaffId      INT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name         VARCHAR(64)  NOT NULL,
    Email        VARCHAR(64)  NOT NULL UNIQUE,
    Phone        VARCHAR(20)  NOT NULL UNIQUE,
    Role         staff_role   NOT NULL,
    Position     VARCHAR(128) NOT NULL DEFAULT '',
    PasswordHash VARCHAR(255) NOT NULL
);

CREATE TABLE Members (
    MemberId     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name         VARCHAR(64)    NOT NULL,
    Email        VARCHAR(64)    NOT NULL UNIQUE,
    Phone        VARCHAR(20)    NOT NULL UNIQUE,
    Balance      DECIMAL(10, 2) NOT NULL DEFAULT 0,
    RegisteredAt TIMESTAMP      NOT NULL DEFAULT NOW(),
    PasswordHash VARCHAR(255)   NOT NULL
);

CREATE TABLE Tariffs (
    TariffId      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name          VARCHAR(64)    NOT NULL UNIQUE,
    Type          tariff_type    NOT NULL,
    DurationDays  INT            NOT NULL DEFAULT 0,
    IncludedHours INT            NOT NULL DEFAULT 0,
    Price         DECIMAL(10, 2) NOT NULL,
    IsActive      BOOLEAN        NOT NULL DEFAULT TRUE
);

CREATE TABLE Spaces (
    SpaceId     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    SpaceTypeId INT          NOT NULL REFERENCES SpaceTypes (SpaceTypeId),
    Name        VARCHAR(64)  NOT NULL UNIQUE,
    Floor       INT          NOT NULL,
    Capacity    INT          NOT NULL,
    Status      space_status NOT NULL DEFAULT 'available',
    Description TEXT         NOT NULL DEFAULT ''
);

CREATE TABLE SpaceAmenities (
    SpaceId   INT NOT NULL REFERENCES Spaces    (SpaceId),
    AmenityId INT NOT NULL REFERENCES Amenities (AmenityId),
    PRIMARY KEY (SpaceId, AmenityId)
);

CREATE TABLE TariffSpaces (
    TariffId INT NOT NULL REFERENCES Tariffs (TariffId),
    SpaceId  INT NOT NULL REFERENCES Spaces  (SpaceId),
    PRIMARY KEY (TariffId, SpaceId)
);

CREATE TABLE Subscriptions (
    SubscriptionId INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MemberId       INT                 NOT NULL REFERENCES Members (MemberId),
    TariffId       INT                 NOT NULL REFERENCES Tariffs (TariffId),
    StartDate      DATE                NOT NULL,
    EndDate        DATE                NOT NULL,
    RemainingMinutes INT               NOT NULL DEFAULT 0,
    Status           subscription_status NOT NULL DEFAULT 'active',
    CHECK (EndDate >= StartDate),
    CHECK (RemainingMinutes >= 0)
);

CREATE TABLE Bookings (
    BookingId   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    SpaceId     INT            NOT NULL REFERENCES Spaces  (SpaceId),
    CreatedBy   INT            NOT NULL REFERENCES Members (MemberId),
    BookingType booking_type   NOT NULL,
    StartTime   TIMESTAMP      NOT NULL,
    EndTime     TIMESTAMP      NOT NULL,
    Status      booking_status NOT NULL DEFAULT 'confirmed',
    CHECK (EndTime > StartTime)
);

CREATE TABLE BookingSubscriptions (
    BookingId      INT NOT NULL PRIMARY KEY REFERENCES Bookings      (BookingId),
    SubscriptionId INT NOT NULL             REFERENCES Subscriptions (SubscriptionId)
);

CREATE TABLE BookingParticipants (
    BookingId INT NOT NULL REFERENCES Bookings (BookingId),
    MemberId  INT NOT NULL REFERENCES Members (MemberId),
    PRIMARY KEY (BookingId, MemberId)
);

CREATE TABLE OneOffs (
    OneOffId  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    BookingId INT NOT NULL REFERENCES Bookings (BookingId),
    MemberId  INT NOT NULL REFERENCES Members (MemberId),
    TariffId  INT NOT NULL REFERENCES Tariffs (TariffId),
    Quantity  INT NOT NULL
);

CREATE TABLE Transactions (
    TransactionId   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MemberId        INT              NOT NULL REFERENCES Members (MemberId),
    Amount          DECIMAL(10, 2)   NOT NULL,
    TransactionType transaction_type NOT NULL,
    TransactionDate TIMESTAMP        NOT NULL DEFAULT NOW(),
    Description     TEXT             NOT NULL DEFAULT '',
    CHECK (Amount > 0)
);

CREATE TABLE TransactionOneOffs (
    TransactionId INT NOT NULL PRIMARY KEY REFERENCES Transactions (TransactionId),
    OneOffId      INT NOT NULL             REFERENCES OneOffs (OneOffId)
);

CREATE TABLE TransactionSubscriptions (
    TransactionId  INT NOT NULL PRIMARY KEY REFERENCES Transactions (TransactionId),
    SubscriptionId INT NOT NULL             REFERENCES Subscriptions (SubscriptionId)
);

-- Audit log for profile and password changes (old/new values per field)
CREATE TABLE MemberProfileAudit (
    AuditId         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MemberId        INT          NOT NULL REFERENCES Members (MemberId),
    ChangedAt       TIMESTAMP    NOT NULL DEFAULT NOW(),
    OldName         VARCHAR(64)  NOT NULL,
    NewName         VARCHAR(64)  NOT NULL,
    OldEmail        VARCHAR(64)  NOT NULL,
    NewEmail        VARCHAR(64)  NOT NULL,
    OldPhone        VARCHAR(20)  NOT NULL,
    NewPhone        VARCHAR(20)  NOT NULL,
    OldPasswordHash VARCHAR(255) NOT NULL,
    NewPasswordHash VARCHAR(255) NOT NULL
);

-- Общие настройки (key-value). Редактирует только стафф.
-- Примеры ключей: WorkingHours24_7 (true/false), Timezone, SlotMinutes, ...
CREATE TABLE SystemSettings (
    Key   VARCHAR(64) NOT NULL PRIMARY KEY,
    Value TEXT        NOT NULL DEFAULT ''
);

-- Рабочие часы по дням недели. 1 = понедельник, 7 = воскресенье (ISO).
-- Формат времени HH:mm, без перехода через полночь (OpeningTime < ClosingTime).
-- При «круглосуточно» можно не использовать или хранить 00:00–24:00.
CREATE TABLE WorkingHours (
    DayOfWeek    INT         NOT NULL PRIMARY KEY CHECK (DayOfWeek BETWEEN 1 AND 7),
    OpeningTime  VARCHAR(5)  NOT NULL,
    ClosingTime  VARCHAR(5)  NOT NULL
);

-- Audit log for staff (create/update/dismiss). Пустые значения: пустая строка для текста, 'inactive' для роли (null не используем).
CREATE TABLE StaffAudit (
    AuditId           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    StaffId            INT          NOT NULL REFERENCES Staff (StaffId),
    ChangedAt          TIMESTAMP    NOT NULL DEFAULT NOW(),
    ChangedByStaffId  INT          NOT NULL REFERENCES Staff (StaffId),
    OldName            VARCHAR(64)  NOT NULL DEFAULT '',
    NewName            VARCHAR(64)  NOT NULL DEFAULT '',
    OldEmail           VARCHAR(64)  NOT NULL DEFAULT '',
    NewEmail           VARCHAR(64)  NOT NULL DEFAULT '',
    OldPhone           VARCHAR(20)  NOT NULL DEFAULT '',
    NewPhone           VARCHAR(20)  NOT NULL DEFAULT '',
    OldRole            staff_role   NOT NULL DEFAULT 'inactive',
    NewRole            staff_role   NOT NULL DEFAULT 'inactive',
    OldPosition        VARCHAR(128) NOT NULL DEFAULT '',
    NewPosition        VARCHAR(128) NOT NULL DEFAULT '',
    OldPasswordHash    VARCHAR(255) NOT NULL DEFAULT '',
    NewPasswordHash    VARCHAR(255) NOT NULL DEFAULT ''
);
