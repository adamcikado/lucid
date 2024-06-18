/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Knex } from 'knex'
import { test } from '@japa/runner'
import { MysqlConfig } from '../../src/types/database.js'
import { Connection } from '../../src/connection/index.js'
import { setup, cleanup, getConfig, resetTables, logger } from '../../test-helpers/index.js'

if (process.env.DB !== 'sqlite') {
  test.group('Connection | config', (group) => {
    group.setup(async () => {
      await setup()
    })

    group.teardown(async () => {
      await cleanup()
    })

    test('get write config by merging values from connection', ({ assert }) => {
      const config = getConfig()
      config.replicas! = {
        write: {
          connection: {
            host: '10.0.0.1',
          },
        },
        read: {
          connection: [
            {
              host: '10.0.0.1',
            },
          ],
        },
      }

      const connection = new Connection('primary', config, logger)
      const writeConfig = connection['getWriteConfig']()

      assert.equal(writeConfig.client, config.client)
      assert.equal((writeConfig.connection as Knex.ConnectionConfig).host, '10.0.0.1')
    })

    test('get read config by merging values from connection', ({ assert }) => {
      const config = getConfig()
      config.replicas! = {
        write: {
          connection: {
            host: '10.0.0.1',
          },
        },
        read: {
          connection: [
            {
              host: '10.0.0.1',
            },
          ],
        },
      }

      const connection = new Connection('primary', config, logger)
      const readConfig = connection['getReadConfig']()

      assert.equal(readConfig.client, config.client)
    })
  })
}

test.group('Connection | setup', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
  })

  group.each.teardown(async () => {
    await resetTables()
  })

  test('do not instantiate knex unless connect is called', async ({ assert }) => {
    const connection = new Connection('primary', getConfig(), logger)
    assert.isUndefined(connection.client)
  })

  test('instantiate knex when connect is invoked', async ({ assert }, done) => {
    const connection = new Connection('primary', getConfig(), logger)
    connection.on('connect', async () => {
      assert.isDefined(connection.client!)
      assert.equal(connection.pool!.numUsed(), 0)
      await connection.disconnect()
      done()
    })

    connection.connect()
  }).waitForDone()

  test('on disconnect destroy knex', async ({ assert }) => {
    const connection = new Connection('primary', getConfig(), logger)
    connection.connect()
    await connection.disconnect()

    assert.isUndefined(connection.client)
    assert.isUndefined(connection.readClient)
  })

  test('on disconnect emit disconnect event', async ({ assert }, done) => {
    const connection = new Connection('primary', getConfig(), logger)
    connection.connect()

    connection.on('disconnect', () => {
      assert.isUndefined(connection.client)
      done()
    })

    await connection.disconnect()
  }).waitForDone()

  test('raise error when unable to make connection', ({ assert }, done) => {
    assert.plan(2)

    const connection = new Connection(
      'primary',
      Object.assign({}, getConfig(), { client: null }),
      logger
    )

    connection.on('error', ({ message }) => {
      try {
        assert.equal(message, "knex: Required configuration option 'client' is missing.")
        done()
      } catch (error) {
        done(error)
      }
    })

    const fn = () => connection.connect()
    assert.throws(fn, /knex: Required configuration option/)
  }).waitForDone()
})

if (process.env.DB === 'mysql') {
  test.group('Connection | setup mysql', () => {
    test('pass user config to mysql driver', async ({ assert }) => {
      const config = getConfig() as MysqlConfig
      config.connection!.charset = 'utf-8'
      config.connection!.typeCast = false

      const connection = new Connection('primary', config, logger)
      connection.connect()

      assert.equal((connection.client as any)['context'].client.constructor.name, 'Client_MySQL2')
      assert.equal((connection.client as any)['context'].client.config.connection.charset, 'utf-8')
      assert.equal((connection.client as any)['context'].client.config.connection.typeCast, false)
      await connection.disconnect()
    })
  })
}
