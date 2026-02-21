-- ============================================================
-- DDL: Coworking Management System (SYSENG variant)
-- PostgreSQL 16
-- ============================================================

-- ============================================================
-- ENUM-types
-- ============================================================

CREATE TYPE space_status        AS ENUM ('available', 'occupied', 'maintenance');
CREATE TYPE tariff_type         AS ENUM ('monthly', 'hourly', 'package');
CREATE TYPE booking_type        AS ENUM ('one_time', 'subscription');
CREATE TYPE booking_status      AS ENUM ('confirmed', 'cancelled', 'completed');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE transaction_type    AS ENUM ('deposit', 'payment', 'refund', 'bonus', 'withdrawal');

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
    Role         VARCHAR(24)  NOT NULL,
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
    RemainingHours INT                 NOT NULL DEFAULT 0,
    Status         subscription_status NOT NULL DEFAULT 'active',
    CHECK (EndDate >= StartDate),
    CHECK (RemainingHours >= 0)
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
